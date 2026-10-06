import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startNostrRelay } from './nostr-relay.mjs';

// §14: the gate's networking runs against a local Nostr-compatible relay
// on ws://127.0.0.1 — NIP-01 subset: EVENT→OK+broadcast, REQ→EOSE,
// kind + #x tag filters.

let relay;
beforeAll(async () => {
  relay = await startNostrRelay();
});
afterAll(async () => {
  await relay.close();
});

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  const waiters = [];
  ws.onmessage = (ev) => {
    const parsed = JSON.parse(String(ev.data));
    const w = waiters.find((x) => x.pred(parsed));
    if (w) {
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(parsed);
    } else {
      messages.push(parsed);
    }
  };
  return {
    ws,
    open: new Promise((r) => {
      ws.onopen = r;
    }),
    next: (pred) =>
      new Promise((resolve, reject) => {
        const hit = messages.find(pred);
        if (hit) {
          messages.splice(messages.indexOf(hit), 1);
          resolve(hit);
          return;
        }
        waiters.push({ pred, resolve });
        setTimeout(() => reject(new Error('timeout')), 5000);
      }),
  };
}

describe('local nostr relay', () => {
  it('answers REQ with EOSE and routes matching EVENTs with OK', async () => {
    const a = client(relay.port);
    const b = client(relay.port);
    await a.open;
    await b.open;
    b.ws.send(JSON.stringify(['REQ', 'sub1', { kinds: [21234], '#x': ['topic-a'] }]));
    await b.next((m) => m[0] === 'EOSE' && m[1] === 'sub1');
    const ev = {
      id: 'e1', kind: 21234, tags: [['x', 'topic-a']], content: 'hi', pubkey: 'p', created_at: 1, sig: 's',
    };
    a.ws.send(JSON.stringify(['EVENT', ev]));
    const ok = await a.next((m) => m[0] === 'OK');
    expect(ok[1]).toBe('e1');
    const got = await b.next((m) => m[0] === 'EVENT' && m[1] === 'sub1');
    expect(got[2].content).toBe('hi');
  });

  it('does not route events with a different kind or topic', async () => {
    const a = client(relay.port);
    const b = client(relay.port);
    await a.open;
    await b.open;
    b.ws.send(JSON.stringify(['REQ', 's2', { kinds: [21234], '#x': ['topic-a'] }]));
    await b.next((m) => m[0] === 'EOSE');
    a.ws.send(JSON.stringify(['EVENT', { id: 'e2', kind: 29999, tags: [['x', 'topic-a']], content: 'no' }]));
    a.ws.send(JSON.stringify(['EVENT', { id: 'e3', kind: 21234, tags: [['x', 'other']], content: 'no' }]));
    a.ws.send(JSON.stringify(['EVENT', { id: 'e4', kind: 21234, tags: [['x', 'topic-a']], content: 'yes' }]));
    const got = await b.next((m) => m[0] === 'EVENT');
    expect(got[2].content).toBe('yes');
  });
});
