// §6.3 source of truth: W(cell) = edits.has(cell) ? edits.value
//                                : G[generatorVersion](seed, cell).
// Chunk data is a CACHE of that function, never saved (§6.2). The main
// thread owns an instance; workers generate their own regions.
import { LwwStore, type Entry } from '../sync/lww';
import type { HlcStamp } from '../sync/hlc';
import { generateChunk } from '../gen/v1/index';
import { CHUNK, chunkOfCell, localIndex, packChunkKey } from './coords';

type CachedChunk =
  | { kind: 'uniform'; value: number }
  | { kind: 'dense'; blocks: Uint16Array };

export class WorldStore {
  readonly seed: readonly [number, number];
  readonly edits = new LwwStore();
  private cache = new Map<number, CachedChunk>();

  constructor(seed: readonly [number, number]) {
    this.seed = seed;
  }

  private ensureChunk(cx: number, cy: number, cz: number): { key: number; chunk: CachedChunk } {
    const key = packChunkKey(cx, cy, cz);
    let chunk = this.cache.get(key);
    if (chunk === undefined) {
      const g = generateChunk(this.seed, cx, cy, cz);
      chunk =
        g.storage.kind === 'uniform'
          ? { kind: 'uniform', value: g.storage.value }
          : { kind: 'dense', blocks: g.storage.blocks };
      // Overlay any edits that arrived before the cache warmed.
      if (this.edits.entriesInChunk(key) > 0) {
        chunk = this.promote(chunk);
        for (const e of this.edits.snapshot(key)) chunk.blocks[e.index] = e.value;
      }
      this.cache.set(key, chunk);
    }
    return { key, chunk };
  }

  private promote(chunk: CachedChunk): { kind: 'dense'; blocks: Uint16Array } {
    if (chunk.kind === 'dense') return chunk;
    const blocks = new Uint16Array(CHUNK * CHUNK * CHUNK);
    blocks.fill(chunk.value);
    return { kind: 'dense', blocks };
  }

  /** The (chunkKey, index) address of a cell — the wire/storage address. */
  locate(x: number, y: number, z: number): { chunkKey: number; index: number } {
    const { cx, cy, cz } = chunkOfCell(x, y, z);
    return {
      chunkKey: packChunkKey(cx, cy, cz),
      index: localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK),
    };
  }

  blockAt(x: number, y: number, z: number): number {
    const { cx, cy, cz } = chunkOfCell(x, y, z);
    const { chunk } = this.ensureChunk(cx, cy, cz);
    if (chunk.kind === 'uniform') return chunk.value;
    return chunk.blocks[localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK)]!;
  }

  /** A local edit. Returns the entry to broadcast, or null for a no-op
   *  (§6.3: an edit whose value equals the current W is not written). */
  localEdit(
    x: number, y: number, z: number,
    value: number, stamp: HlcStamp, peer: bigint,
  ): Entry | null {
    if (this.blockAt(x, y, z) === value) return null;
    const { cx, cy, cz } = chunkOfCell(x, y, z);
    const key = packChunkKey(cx, cy, cz);
    const index = localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK);
    const entry: Entry = { value, l: stamp.l, c: stamp.c, peer };
    this.applyRemote(key, index, entry);
    return entry;
  }

  /** §11.2 clock-ahead repair: entries stamped beyond now + 60 s (a fast
   *  clock during offline play) are REPLACED with fresh local stamps in the
   *  same relative order. Convergence-safe: no honest peer can have
   *  accepted them (everyone defers such stamps, and the skew check
   *  refuses fast-clocked peers). Returns how many were restamped. */
  repairClockAhead(nowMs: number, hlc: import('../sync/hlc').Hlc, peer: bigint): number {
    const limit = nowMs + 60_000;
    const offending: Array<{ chunkKey: number; index: number; entry: Entry }> = [];
    for (const chunkKey of this.edits.chunkKeys()) {
      for (const e of this.edits.snapshot(chunkKey)) {
        if (e.l > limit) {
          offending.push({ chunkKey, index: e.index, entry: e });
        }
      }
    }
    offending.sort((a, b) =>
      a.entry.l - b.entry.l || a.entry.c - b.entry.c ||
      (a.entry.peer < b.entry.peer ? -1 : a.entry.peer > b.entry.peer ? 1 : 0),
    );
    for (const { chunkKey, index, entry } of offending) {
      const stamp = hlc.send(nowMs);
      // Same value, fresh stamp: an ordinary new op that supersedes the
      // never-accepted one locally.
      this.edits.replaceForRepair(chunkKey, index, {
        value: entry.value, l: stamp.l, c: stamp.c, peer,
      });
    }
    return offending.length;
  }

  /** Apply an entry (remote or local) through LWW; keeps the cache true. */
  applyRemote(chunkKey: number, index: number, entry: Entry): boolean {
    const won = this.edits.apply(chunkKey, index, entry);
    if (!won) return false;
    const cached = this.cache.get(chunkKey);
    if (cached !== undefined) {
      const dense = this.promote(cached);
      dense.blocks[index] = entry.value;
      this.cache.set(chunkKey, dense);
    }
    return true;
  }
}
