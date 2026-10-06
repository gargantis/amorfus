// §12.6: export to .amorfus and the three import modes. Import validates
// with the same pure validator as sync (§11.3), writes in stages under an
// `importing` status flag, and never lets a future stamp into storage:
// Restore and Fork restamp beyond now + 60 s (clock-ahead repair rules),
// Merge refuses such files with a Fork offer.
import {
  encodeAmorfusFile,
  decodeAmorfusFile,
  type AmorfusFile,
} from '../core/codec/container';
import { encodeChunkEntries } from '../core/codec/chunk-entries';
import { CodecError } from '../core/codec/varint';
import { LwwStore, type IndexedEntry } from '../core/sync/lww';
import { Hlc } from '../core/sync/hlc';
import { isValidEntryShape } from '../core/sync/validate';
import {
  type AmorfusDb,
  type WorldMeta,
  loadWorld,
  saveWorldMeta,
  saveChunkBlob,
  randomWorldId,
} from './db';

const FUTURE_WINDOW_MS = 60_000;
const APP_VERSION = '0.0.0';

export async function exportWorld(
  db: AmorfusDb,
  worldId: string,
  profile: 0 | 1,
  player?: unknown,
): Promise<Uint8Array> {
  const world = await loadWorld(db, worldId);
  if (world === null) throw new Error(`world ${worldId} not found`);
  const file: AmorfusFile = {
    profile,
    meta: {
      worldId: world.meta.worldId,
      lineageId: world.meta.lineageId,
      name: world.meta.name,
      seed: world.meta.seed,
      generator: world.meta.generator,
      chunkSize: 32,
      materials: world.meta.materials,
      appVersion: APP_VERSION,
    },
    chunks: [...world.chunks.entries()],
  };
  if (profile === 0 && player !== undefined) file.player = player;
  return encodeAmorfusFile(file);
}

export type ImportMode = 'fork' | 'restore' | 'merge';

export interface ImportResult {
  ok: boolean;
  worldId?: string;
  reason?: string;
}

export async function importAmorfus(
  db: AmorfusDb,
  bytes: Uint8Array,
  mode: ImportMode,
  nowMs: number,
): Promise<ImportResult> {
  let file: AmorfusFile;
  try {
    file = await decodeAmorfusFile(bytes);
  } catch (err) {
    if (err instanceof CodecError) return { ok: false, reason: `not a valid .amorfus file: ${err.message}` };
    throw err;
  }

  // §12.6 step 3: the same pure validator as sync.
  let hasFuture = false;
  for (const [chunkKey, entries] of file.chunks) {
    for (const e of entries) {
      if (!isValidEntryShape(chunkKey, e.index, e.value, e.l, e.peer)) {
        return { ok: false, reason: 'file contains invalid entries' };
      }
      if (e.l > nowMs + FUTURE_WINDOW_MS) hasFuture = true;
    }
  }

  if (mode === 'merge') {
    if (file.profile !== 0 || file.meta.worldId === undefined) {
      return { ok: false, reason: 'share files cannot be merged — Fork it instead' };
    }
    if (hasFuture) {
      return { ok: false, reason: 'file carries future stamps — Fork or Restore it instead' };
    }
    const existing = await loadWorld(db, file.meta.worldId);
    if (existing === null) return { ok: false, reason: 'no local world with this id — use Restore' };
    if (
      existing.meta.seed[0] !== file.meta.seed[0] ||
      existing.meta.seed[1] !== file.meta.seed[1] ||
      existing.meta.generator.version !== file.meta.generator.version
    ) {
      return { ok: false, reason: 'world id matches but seed or generator differs' };
    }
    // Exactly the sync join (§12.6): LWW-apply, then write canonical blobs.
    const store = new LwwStore();
    for (const [key, entries] of existing.chunks) {
      for (const e of entries) store.apply(key, e.index, e);
    }
    for (const [key, entries] of file.chunks) {
      for (const e of entries) store.apply(key, e.index, e);
    }
    for (const key of store.chunkKeys()) {
      await saveChunkBlob(db, existing.meta.worldId, key, encodeChunkEntries(store.snapshot(key)));
    }
    return { ok: true, worldId: existing.meta.worldId };
  }

  if (mode === 'restore') {
    if (file.profile !== 0 || file.meta.worldId === undefined) {
      return { ok: false, reason: 'share files cannot be restored — Fork it instead' };
    }
    const existing = await db.get('worlds', file.meta.worldId);
    if (existing !== undefined) {
      return { ok: false, reason: 'a world with this id already exists — use Merge or Fork' };
    }
    return stageWrite(db, file, file.meta.worldId, nowMs);
  }

  // fork: always possible; new worldId, lineage kept, future stamps rebased
  return stageWrite(db, file, randomWorldId(), nowMs);
}

async function stageWrite(
  db: AmorfusDb,
  file: AmorfusFile,
  worldId: string,
  nowMs: number,
): Promise<ImportResult> {
  // Clock-ahead repair for anything beyond now + 60 s (§11.2, §12.6):
  // fresh local stamps, same values, same relative order.
  const hlc = new Hlc();
  const peerBytes = new BigUint64Array(1);
  crypto.getRandomValues(peerBytes);
  const peer = peerBytes[0]! | 1n;
  const offenders: Array<{ key: number; e: IndexedEntry }> = [];
  for (const [key, entries] of file.chunks) {
    for (const e of entries) {
      if (e.l > nowMs + FUTURE_WINDOW_MS) offenders.push({ key, e });
    }
  }
  offenders.sort(
    (a, b) =>
      a.e.l - b.e.l || a.e.c - b.e.c || (a.e.peer < b.e.peer ? -1 : a.e.peer > b.e.peer ? 1 : 0),
  );
  const restamped = new Map<string, { l: number; c: number; peer: bigint }>();
  for (const { key, e } of offenders) {
    const stamp = hlc.send(nowMs);
    restamped.set(`${key}:${e.index}:${e.l}:${e.c}:${e.peer}`, { ...stamp, peer });
  }

  const meta: WorldMeta = {
    worldId,
    lineageId: file.meta.lineageId,
    name: file.meta.name,
    seed: file.meta.seed,
    generator: file.meta.generator,
    chunkSize: 32,
    materials: file.meta.materials,
    hlc: hlc.state(),
    status: 'importing',
  };
  await saveWorldMeta(db, meta);
  for (const [key, entries] of file.chunks) {
    const store = new LwwStore();
    for (const e of entries) {
      const fix = restamped.get(`${key}:${e.index}:${e.l}:${e.c}:${e.peer}`);
      const entry = fix === undefined ? e : { value: e.value, l: fix.l, c: fix.c, peer: fix.peer };
      store.apply(key, e.index, entry);
    }
    await saveChunkBlob(db, worldId, key, encodeChunkEntries(store.snapshot(key)));
  }
  if (file.player !== undefined) await db.put('players', file.player, [worldId, 'local']);
  meta.status = 'ready';
  await saveWorldMeta(db, meta);
  return { ok: true, worldId };
}
