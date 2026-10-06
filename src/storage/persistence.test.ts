import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import {
  openAmorfusDb,
  saveWorldMeta,
  saveChunkBlob,
  loadWorld,
  startupCleanup,
  type WorldMeta,
} from './db';
import { FlushPolicy } from './flush-policy';
import { exportWorld, importAmorfus } from './import-export';
import { LwwStore, type IndexedEntry } from '../core/sync/lww';
import { encodeChunkEntries } from '../core/codec/chunk-entries';
import { packChunkKey } from '../core/world/coords';

const K1 = packChunkKey(0, 0, 0);
const K2 = packChunkKey(1, 0, 0);

function meta(worldId: string, over: Partial<WorldMeta> = {}): WorldMeta {
  return {
    worldId,
    lineageId: 'f'.repeat(32),
    name: 'W',
    seed: [1, 1],
    generator: { id: 'amorfus', version: 1 },
    chunkSize: 32,
    materials: ['air', 'grass', 'dirt', 'stone', 'sand', 'planks', 'brick', 'reserved7'],
    hlc: { l: 0, c: 0 },
    status: 'ready',
    ...over,
  };
}

const e = (index: number, value: number, l: number, peer = 1n): IndexedEntry => ({
  index, value, l, c: 0, peer,
});

let dbCounter = 0;
async function freshDb() {
  return openAmorfusDb(`amorfus-test-${process.pid}-${dbCounter++}`);
}

describe('db round trips (P7)', () => {
  it('saves and loads a world byte-identically', async () => {
    const db = await freshDb();
    await saveWorldMeta(db, meta('a'.repeat(32)));
    const blob1 = encodeChunkEntries([e(1, 3, 10), e(2, 5, 20, 9n)]);
    const blob2 = encodeChunkEntries([e(0, 1, 15)]);
    await saveChunkBlob(db, 'a'.repeat(32), K1, blob1);
    await saveChunkBlob(db, 'a'.repeat(32), K2, blob2);
    const loaded = await loadWorld(db, 'a'.repeat(32));
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.name).toBe('W');
    // byte-identical re-encode (§14 persistence)
    const store = new LwwStore();
    for (const [key, entries] of loaded!.chunks) {
      for (const en of entries) store.apply(key, en.index, en);
    }
    expect(encodeChunkEntries(store.snapshot(K1))).toEqual(blob1);
    expect(encodeChunkEntries(store.snapshot(K2))).toEqual(blob2);
  });

  it('startup cleanup removes worlds stuck in importing', async () => {
    const db = await freshDb();
    await saveWorldMeta(db, meta('b'.repeat(32), { status: 'importing' }));
    await saveChunkBlob(db, 'b'.repeat(32), K1, encodeChunkEntries([e(0, 1, 1)]));
    await saveWorldMeta(db, meta('c'.repeat(32)));
    await startupCleanup(db);
    expect(await loadWorld(db, 'b'.repeat(32))).toBeNull();
    expect(await loadWorld(db, 'c'.repeat(32))).not.toBeNull();
  });
});

describe('version handling (§12.1)', () => {
  it('opening an older version where a newer exists → VersionError', async () => {
    const name = `amorfus-ver-${process.pid}-${dbCounter++}`;
    const { openDB } = await import('idb');
    const v2 = await openDB(name, 2, { upgrade(db) { db.createObjectStore('x'); } });
    v2.close();
    await expect(openDB(name, 1)).rejects.toMatchObject({ name: 'VersionError' });
  });
});

describe('flush policy (§12.1)', () => {
  it('flushes after 1.5 s idle and at most every 5 s', () => {
    const f = new FlushPolicy();
    f.markDirty(0);
    expect(f.shouldFlush(1000)).toBe(false); // not idle long enough
    expect(f.shouldFlush(1600)).toBe(true); // 1.6 s idle
    f.flushed(1600);
    expect(f.shouldFlush(1700)).toBe(false); // clean
    // constant editing: idle never reached, max-5s fires
    for (let t = 2000; t < 6500; t += 500) f.markDirty(t);
    expect(f.shouldFlush(6600)).toBe(false); // only 4.6 s since last flush… dirty since 2000
    expect(f.shouldFlush(7100)).toBe(true); // 5.1 s past first dirty
  });
});

describe('export / import (§12.6)', () => {
  async function seededDb() {
    const db = await freshDb();
    const id = 'a'.repeat(32);
    await saveWorldMeta(db, meta(id, { hlc: { l: 20, c: 0 } }));
    await saveChunkBlob(db, id, K1, encodeChunkEntries([e(1, 3, 10), e(2, 5, 20, 9n)]));
    return { db, id };
  }

  it('backup export round-trips through Restore on an empty db', async () => {
    const { db, id } = await seededDb();
    const bytes = await exportWorld(db, id, 0, { position: [1, 2, 3] });
    const db2 = await freshDb();
    const result = await importAmorfus(db2, bytes, 'restore', 1000);
    expect(result.ok).toBe(true);
    const loaded = await loadWorld(db2, id);
    expect(loaded).not.toBeNull();
    expect(encodeChunkEntries(loaded!.chunks.get(K1)!)).toEqual(
      encodeChunkEntries([e(1, 3, 10), e(2, 5, 20, 9n)]),
    );
  });

  it('Restore refuses when the worldId already exists', async () => {
    const { db, id } = await seededDb();
    const bytes = await exportWorld(db, id, 0);
    const result = await importAmorfus(db, bytes, 'restore', 1000);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exists/);
  });

  it('Fork creates a new worldId, keeps lineage, and can always run', async () => {
    const { db, id } = await seededDb();
    const bytes = await exportWorld(db, id, 0);
    const result = await importAmorfus(db, bytes, 'fork', 1000);
    expect(result.ok).toBe(true);
    expect(result.worldId).not.toBe(id);
    const loaded = await loadWorld(db, result.worldId!);
    expect(loaded!.meta.lineageId).toBe('f'.repeat(32));
  });

  it('Merge equals a live sync join (import-merge ≡ live sync, §14)', async () => {
    const { db, id } = await seededDb();
    const bytes = await exportWorld(db, id, 0);
    // Local replica has concurrent edits on the same world.
    const db2 = await freshDb();
    await saveWorldMeta(db2, meta(id));
    await saveChunkBlob(db2, id, K1, encodeChunkEntries([e(7, 2, 5), e(1, 4, 15)]));
    const result = await importAmorfus(db2, bytes, 'merge', 1000);
    expect(result.ok).toBe(true);
    // Reference: LWW-apply both sets.
    const ref = new LwwStore();
    for (const en of [e(1, 4, 15), e(7, 2, 5), e(1, 3, 10), e(2, 5, 20, 9n)]) {
      ref.apply(K1, en.index, en);
    }
    const loaded = await loadWorld(db2, id);
    expect(encodeChunkEntries(loaded!.chunks.get(K1)!)).toEqual(
      encodeChunkEntries(ref.snapshot(K1)),
    );
  });

  it('Merge refuses a mismatched seed and a share file', async () => {
    const { db, id } = await seededDb();
    const bytes = await exportWorld(db, id, 0);
    const db2 = await freshDb();
    await saveWorldMeta(db2, meta(id, { seed: [9, 9] }));
    const bad = await importAmorfus(db2, bytes, 'merge', 1000);
    expect(bad.ok).toBe(false);
    const share = await exportWorld(db, id, 1);
    const shareMerge = await importAmorfus(db2, share, 'merge', 1000);
    expect(shareMerge.ok).toBe(false);
    expect(shareMerge.reason).toMatch(/share|fork/i);
  });

  it('share export strips worldId and player data, Fork imports it', async () => {
    const { db, id } = await seededDb();
    const bytes = await exportWorld(db, id, 1, { position: [1, 2, 3] });
    const db2 = await freshDb();
    const restore = await importAmorfus(db2, bytes, 'restore', 1000);
    expect(restore.ok).toBe(false); // share files can only be forked
    const fork = await importAmorfus(db2, bytes, 'fork', 1000);
    expect(fork.ok).toBe(true);
  });

  it('Merge refuses future stamps beyond now + 60 s with a Fork offer', async () => {
    const { db, id } = await seededDb();
    const farFuture = 10_000_000;
    await saveChunkBlob(db, id, K2, encodeChunkEntries([e(0, 1, farFuture)]));
    const bytes = await exportWorld(db, id, 0);
    const db2 = await freshDb();
    await saveWorldMeta(db2, meta(id));
    const result = await importAmorfus(db2, bytes, 'merge', 1000);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/future|fork/i);
    // Fork rebases the future stamps instead.
    const fork = await importAmorfus(db2, bytes, 'fork', 1000);
    expect(fork.ok).toBe(true);
    const loaded = await loadWorld(db2, fork.worldId!);
    for (const entries of loaded!.chunks.values()) {
      for (const en of entries) expect(en.l).toBeLessThanOrEqual(1000 + 60_000);
    }
  });

  it('rejects malformed bytes and structurally invalid entries', async () => {
    const db = await freshDb();
    const garbage = new Uint8Array([1, 2, 3, 4]);
    const r = await importAmorfus(db, garbage, 'fork', 1000);
    expect(r.ok).toBe(false);
  });
});
