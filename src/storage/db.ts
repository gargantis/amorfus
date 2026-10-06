// §12.1: IndexedDB via idb. Database `amorfus` v1 with the four stores;
// chunk blobs are the canonical A.2 encoding, self-contained. Writes use
// relaxed durability except imports and deletes (callers choose).
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { decodeChunkEntries } from '../core/codec/chunk-entries';
import { CodecError } from '../core/codec/varint';
import { isValidEntryShape } from '../core/sync/validate';
import { Hlc } from '../core/sync/hlc';
import type { IndexedEntry } from '../core/sync/lww';
import { unpackChunkKey, packChunkKey } from '../core/world/coords';
import type { HlcStamp } from '../core/sync/hlc';

export interface WorldMeta {
  worldId: string; // 32 hex chars
  lineageId: string;
  name: string;
  seed: [number, number];
  seedText?: string;
  generator: { id: string; version: number };
  chunkSize: 32;
  materials: string[];
  hlc: HlcStamp;
  roomSecret?: string; // only where D-12 allows
  status: 'ready' | 'importing';
}

interface AmorfusSchema extends DBSchema {
  worlds: { key: string; value: WorldMeta };
  chunks: { key: [string, number, number, number]; value: Uint8Array };
  players: { key: [string, string]; value: unknown };
  kv: { key: string; value: unknown };
}

export type AmorfusDb = IDBPDatabase<AmorfusSchema>;

export async function openAmorfusDb(
  dbName = 'amorfus',
  onVersionChange?: () => void,
): Promise<AmorfusDb> {
  return openDB<AmorfusSchema>(dbName, 1, {
    upgrade(db) {
      db.createObjectStore('worlds', { keyPath: 'worldId' });
      db.createObjectStore('chunks');
      db.createObjectStore('players');
      db.createObjectStore('kv');
    },
    blocking() {
      // §12.1 versionchange: close so the newer page can proceed; the UI
      // asks to reload.
      onVersionChange?.();
    },
  });
}

export async function saveWorldMeta(db: AmorfusDb, meta: WorldMeta): Promise<void> {
  await db.put('worlds', meta);
}

export async function saveChunkBlob(
  db: AmorfusDb,
  worldId: string,
  chunkKey: number,
  blob: Uint8Array,
): Promise<void> {
  const { cx, cy, cz } = unpackChunkKey(chunkKey);
  await db.put('chunks', blob, [worldId, cx, cy, cz]);
}

export interface LoadedWorld {
  meta: WorldMeta;
  chunks: Map<number, IndexedEntry[]>;
  player?: unknown;
  /** blobs that failed to decode and were skipped (never fatal) */
  corruptChunks: number;
  /** entries that failed the §11.3 structural check and were dropped */
  droppedEntries: number;
}

export async function loadWorld(db: AmorfusDb, worldId: string): Promise<LoadedWorld | null> {
  const meta = await db.get('worlds', worldId);
  if (meta === undefined || meta.status !== 'ready') return null;
  const range = IDBKeyRange.bound([worldId, -Infinity, -Infinity, -Infinity], [worldId, Infinity, Infinity, Infinity]);
  const chunks = new Map<number, IndexedEntry[]>();
  let corruptChunks = 0;
  let droppedEntries = 0;
  let cursor = await db.transaction('chunks').store.openCursor(range);
  while (cursor !== null) {
    const [, cx, cy, cz] = cursor.key as [string, number, number, number];
    // §12.4: every read is untrusted (shared gateways share this origin's
    // storage). A corrupt blob costs that chunk's edits, never the world.
    try {
      const key = packChunkKey(cx, cy, cz);
      const decoded = decodeChunkEntries(cursor.value);
      const valid = decoded.filter((e) => isValidEntryShape(key, e.index, e.value, e.l, e.peer));
      droppedEntries += decoded.length - valid.length;
      if (valid.length > 0) chunks.set(key, valid);
    } catch (err) {
      if (!(err instanceof CodecError) && !(err instanceof RangeError)) throw err;
      corruptChunks += 1;
    }
    cursor = await cursor.continue();
  }
  const player = await db.get('players', [worldId, 'local']);
  const out: LoadedWorld = { meta, chunks, corruptChunks, droppedEntries };
  if (player !== undefined) out.player = player;
  return out;
}

/** §11.2 at open: entries stamped beyond now + 60 s (a fast clock during
 *  offline play) are REPLACED with fresh local stamps in the same
 *  relative order — no honest peer can have accepted them. Also reports
 *  the largest stamp, so the HLC can be seeded at or above it
 *  ("opening a world sets l ≥ the largest stored l"). Mutates `chunks`. */
export function repairLoadedWorld(
  chunks: Map<number, IndexedEntry[]>,
  nowMs: number,
): { repaired: number; repairedChunks: number[]; maxStamp: { l: number; c: number } } {
  const limit = nowMs + 60_000;
  const offenders: IndexedEntry[] = [];
  const touched = new Set<number>();
  for (const [key, entries] of chunks) {
    for (const e of entries) {
      if (e.l > limit) {
        offenders.push(e);
        touched.add(key);
      }
    }
  }
  offenders.sort(
    (a, b) => a.l - b.l || a.c - b.c || (a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0),
  );
  if (offenders.length > 0) {
    const hlc = new Hlc();
    const rnd = new BigUint64Array(1);
    crypto.getRandomValues(rnd);
    const peer = rnd[0]! | 1n;
    for (const e of offenders) {
      const stamp = hlc.send(nowMs);
      e.l = stamp.l;
      e.c = stamp.c;
      e.peer = peer;
    }
    for (const key of touched) {
      chunks.get(key)!.sort(
        (a, b) =>
          a.l - b.l || a.c - b.c ||
          (a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0) || a.index - b.index,
      );
    }
  }
  let maxL = 0;
  let maxC = 0;
  for (const entries of chunks.values()) {
    for (const e of entries) {
      if (e.l > maxL || (e.l === maxL && e.c > maxC)) {
        maxL = e.l;
        maxC = e.c;
      }
    }
  }
  return { repaired: offenders.length, repairedChunks: [...touched], maxStamp: { l: maxL, c: maxC } };
}

export async function listWorlds(db: AmorfusDb): Promise<WorldMeta[]> {
  const all = await db.getAll('worlds');
  return all.filter((w) => w.status === 'ready');
}

export async function deleteWorld(db: AmorfusDb, worldId: string): Promise<void> {
  const tx = db.transaction(['worlds', 'chunks', 'players'], 'readwrite', { durability: 'strict' });
  await tx.objectStore('worlds').delete(worldId);
  const range = IDBKeyRange.bound([worldId, -Infinity, -Infinity, -Infinity], [worldId, Infinity, Infinity, Infinity]);
  let cursor = await tx.objectStore('chunks').openCursor(range);
  while (cursor !== null) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.objectStore('players').delete(IDBKeyRange.bound([worldId, ''], [worldId, '￿']));
  await tx.done;
}

/** §12.6: leftovers of a crashed staged import are cleaned at startup. */
export async function startupCleanup(db: AmorfusDb): Promise<void> {
  const all = await db.getAll('worlds');
  for (const w of all) {
    if (w.status === 'importing') await deleteWorld(db, w.worldId);
  }
}

export function randomWorldId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
