// §14: a minimal NIP-01 relay for the gate — ws://127.0.0.1 only, so the
// networking e2e contacts nothing public. EVENT → OK + broadcast to
// matching subscriptions; REQ → EOSE; filters match kinds and #x tags.
import { WebSocketServer } from 'ws';

export async function startNostrRelay(port = 0) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  const subs = new Map(); // ws -> Map<subId, filters[]>

  wss.on('connection', (ws) => {
    subs.set(ws, new Map());
    ws.on('close', () => subs.delete(ws));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;
      const [type] = msg;
      if (type === 'REQ') {
        const [, subId, ...filters] = msg;
        subs.get(ws)?.set(subId, filters);
        ws.send(JSON.stringify(['EOSE', subId]));
      } else if (type === 'CLOSE') {
        subs.get(ws)?.delete(msg[1]);
      } else if (type === 'EVENT') {
        const ev = msg[1];
        if (typeof ev?.id !== 'string') return;
        ws.send(JSON.stringify(['OK', ev.id, true, '']));
        for (const [client, clientSubs] of subs) {
          if (client.readyState !== 1) continue;
          for (const [subId, filters] of clientSubs) {
            if (filters.some((f) => matches(f, ev))) {
              client.send(JSON.stringify(['EVENT', subId, ev]));
              break;
            }
          }
        }
      }
    });
  });

  await new Promise((resolve) => wss.on('listening', resolve));
  return {
    port: wss.address().port,
    close: () =>
      new Promise((resolve) => {
        for (const ws of wss.clients) ws.terminate();
        wss.close(resolve);
      }),
  };
}

function matches(filter, ev) {
  if (Array.isArray(filter.kinds) && !filter.kinds.includes(ev.kind)) return false;
  const topics = filter['#x'];
  if (Array.isArray(topics)) {
    const evTopics = (ev.tags ?? []).filter((t) => t[0] === 'x').map((t) => t[1]);
    if (!topics.some((t) => evTopics.includes(t))) return false;
  }
  return true;
}
