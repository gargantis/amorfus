// §14 e2e `core` project: #test=core boots world, storage and net WITHOUT
// the renderer, so reload/handoff/CSP/zero-third-party tests stay in CI
// whatever D-17 decides about GPU runners. Also the §12.5 handoff sender
// page and its test receiver.
import { WorldSession } from './world-session';
import { LwwStore } from '../core/sync/lww';
import { Hlc } from '../core/sync/hlc';
import { chunkOfCell, packChunkKey, localIndex, CHUNK } from '../core/world/coords';
import { parseHandoffHash, handoffTargetAllowed, postHandoff, type HandoffFile } from '../storage/handoff';
import { exportWorld } from '../storage/import-export';
import { listWorlds } from '../storage/db';
import { LwwStore as NetLww } from '../core/sync/lww';
import { Multiplayer, type EditLike } from '../net/multiplayer';
import type { Entry } from '../core/sync/lww';

function statusLine(text: string): void {
  const el = document.getElementById('fallback-title');
  if (el) el.textContent = text;
  const note = document.getElementById('fallback-note');
  if (note) note.textContent = '';
}

export async function runCoreMode(): Promise<void> {
  const session = await WorldSession.open({ seed: [1, 1] });
  const edits = new LwwStore();
  const hlc = new Hlc(session.meta.hlc);
  for (const [key, entries] of session.loaded.chunks) {
    for (const e of entries) edits.apply(key, e.index, e);
  }
  const target = {
    edits,
    hlc,
    onEdit: null as ((key: number) => void) | null,
  };
  session.attach(target);

  let editCount = 0;
  for (const key of edits.chunkKeys()) editCount += edits.entriesInChunk(key);

  window.__amorfusCore = {
    ready: true,
    worldId: session.meta.worldId,
    originKind: session.originClass.kind,
    banner: WorldSession.banner(),
    editCount,
    applyEdit: (x: number, y: number, z: number, value: number): void => {
      const { cx, cy, cz } = chunkOfCell(x, y, z);
      const key = packChunkKey(cx, cy, cz);
      const index = localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK);
      const stamp = hlc.send(Date.now());
      edits.apply(key, index, { value, l: stamp.l, c: stamp.c, peer: 7n });
      target.onEdit?.(key);
      window.__amorfusCore!.editCount += 1;
    },
    flush: () => session.flushNow(),
  };
  statusLine(`core test mode — world ${session.meta.worldId.slice(0, 8)}, ${editCount} edits, ${session.originClass.kind}`);
}

export async function runHandoffSender(): Promise<boolean> {
  const parsed = parseHandoffHash(location.hash);
  if (parsed === null) return false;
  const allowed = handoffTargetAllowed(parsed.to, location.hostname);
  const main = document.getElementById('fallback');
  statusLine('Hand saves to a newer Amorfus?');
  if (!allowed) {
    statusLine(`Handoff refused: ${parsed.to} is not an allowed destination.`);
    window.__amorfusHandoff = { role: 'sender', status: 'refused-origin' };
    return true;
  }
  const p = document.createElement('p');
  p.textContent = `This will send every saved world to: ${parsed.to}`;
  const button = document.createElement('button');
  button.textContent = 'Send my worlds';
  button.style.cssText = 'font:16px system-ui;padding:8px 16px;';
  button.onclick = () => {
    void (async () => {
      const session = await WorldSession.open({ seed: [1, 1] });
      const files: HandoffFile[] = [];
      for (const w of await listWorlds(session.db)) {
        files.push({ name: `${w.name}.amorfus`, bytes: await exportWorld(session.db, w.worldId, 0) });
      }
      if (window.opener !== null) {
        postHandoff(window.opener as Window, parsed.to, parsed.nonce, files);
        statusLine(`Sent ${files.length} world(s).`);
        window.__amorfusHandoff = { role: 'sender', status: 'sent', count: files.length };
      } else {
        statusLine('No opener window — the handoff must be started from the newer build.');
        window.__amorfusHandoff = { role: 'sender', status: 'no-opener' };
      }
    })();
  };
  main?.append(p, button);
  window.__amorfusHandoff = { role: 'sender', status: 'awaiting-confirm' };
  return true;
}

/** Test receiver (#test=handoff-receiver&target=<sender base URL>): the
 *  real receiver ships with the second release (D-18). */
export async function runHandoffReceiver(): Promise<void> {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const targetBase = decodeURIComponent(hash.get('target') ?? '');
  const nonce = Math.random().toString(36).slice(2, 10);
  const senderOrigin = new URL(targetBase).origin;
  const state = {
    role: 'receiver' as const,
    status: 'waiting',
    files: 0,
    rejected: 0,
    nonce,
  };
  window.__amorfusHandoff = state;
  addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data as { type?: string; nonce?: string; files?: HandoffFile[] };
    if (data?.type !== 'amorfus-handoff') return;
    // §12.5 receiver checks: event.origin, event.source, the nonce.
    if (ev.origin !== senderOrigin || data.nonce !== nonce || ev.source === null) {
      state.rejected += 1;
      return;
    }
    state.files = data.files?.length ?? 0;
    state.status = 'received';
    statusLine(`handoff received: ${state.files} file(s)`);
  });
  const url = `${targetBase}#amorfus-handoff=${nonce}&to=${encodeURIComponent(location.origin)}`;
  const popup = open(url, 'amorfus-handoff');
  statusLine(popup === null ? 'popup blocked' : 'receiver waiting for the sender popup…');
  await Promise.resolve();
}


/** §14 networking tests, renderer-free (#test=net). Test overrides
 *  (local relay, no ICE, blocked pair) are honoured on loopback hosts
 *  only. */
export function runNetTestMode(): void {
  const loopback =
    location.hostname === 'localhost' ||
    location.hostname.endsWith('.localhost') ||
    location.hostname === '127.0.0.1';
  if (!loopback) {
    statusLine('net test mode is loopback-only');
    return;
  }
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const relays = hash.get('relays')?.split(',') ?? [];
  const blockNthRaw = hash.get('blockNth');

  const edits = new NetLww();
  const hlc = new Hlc();
  const rnd = new BigUint64Array(1);
  crypto.getRandomValues(rnd);
  const editLike: EditLike = {
    edits,
    hlc,
    sessionId: rnd[0]! | 1n,
    applyRemoteEntry: (chunkKey, index, entry) => edits.apply(chunkKey, index, entry),
    onLocalEntry: null,
  };
  const mp = new Multiplayer({
    editManager: editLike,
    seed: [1, 1],
    worldId: new Uint8Array(16).fill(1),
    name: `n${Math.floor(Math.random() * 100)}`,
    color: 1,
    relayOverride: relays.length > 0 ? relays : undefined,
    noIce: hash.get('ice') === 'none',
    blockNth: blockNthRaw !== null ? Number(blockNthRaw) : undefined,
  });
  mp.getPose = () => ({
    position: [Math.random() * 4, 40, 0],
    velocity: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    flying: true,
    held: 1,
  });
  window.__amorfusNet = {
    host: () => mp.host(),
    join: (code: string) => mp.join(code),
    leave: () => mp.leave(),
    connected: () => mp.connected,
    secret: () => mp.secret,
    avatars: () => mp.avatars.size,
    applyEdit: (x: number, y: number, z: number, value: number): void => {
      const { cx, cy, cz } = chunkOfCell(x, y, z);
      const key = packChunkKey(cx, cy, cz);
      const index = localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK);
      const stamp = hlc.send(Date.now());
      const entry: Entry = { value, l: stamp.l, c: stamp.c, peer: editLike.sessionId };
      edits.apply(key, index, entry);
      mp.session?.broadcastLocalEntry(key, index, entry);
    },
    getBlock: (x: number, y: number, z: number): number => {
      const { cx, cy, cz } = chunkOfCell(x, y, z);
      const key = packChunkKey(cx, cy, cz);
      const index = localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK);
      return edits.get(key, index)?.value ?? -1;
    },
    closeLog: () => mp.session?.closeLog.map((c) => c.why) ?? [],
    rekey: () => mp.rekey(mp.session?.admitted() ?? []),
  };
  statusLine('net test mode ready');
}
