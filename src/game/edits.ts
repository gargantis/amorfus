// §9.4 edit transactions. An edit writes the log and the voxel cache
// synchronously, dirties up to 8 chunks (§7.5), dispatches them as ONE
// transaction at P0/P1, and when every dirty chunk's mesh has returned,
// swaps render AND collision buffers in the same frame — the split-swap
// counter must stay 0.
import { CHUNK, chunkOfCell, packChunkKey, localIndex } from '../core/world/coords';

function serializeRegionEdits(edits: Map<number, Map<number, number>>): Array<[number, number[]]> {
  const out: Array<[number, number[]]> = [];
  for (const [key, m] of edits) {
    const pairs: number[] = [];
    for (const [i, v] of m) pairs.push(i, v);
    out.push([key, pairs]);
  }
  return out;
}
import { Hlc } from '../core/sync/hlc';
import { LwwStore, type Entry } from '../core/sync/lww';
import { assembleRemeshInput } from '../core/mesh/assemble';
import type { Streaming } from './streaming';
import { PRIORITY } from './worker-pool';
import type { JobStatus } from './worker-pool';
import type { MeshResponse } from '../workers/gen-mesh.worker';
import type { Renderer } from '../render/renderer';

const K_REACH_LO = 9; // k + 3 (§7.5)
const K_REACH_HI = 10; // k + 4

/** The chunks whose corner range meets [b−9, b+10] on every axis. */
export function dirtyChunksForEdit(bx: number, by: number, bz: number): number[] {
  const keys: number[] = [];
  // A chunk's corner range is [c·32, c·32+32]; it meets [v−9, v+10] for
  // c from ceil((v−9−32)/32) (closed LOWER touch at c·32+32 = v−9)
  // while c·32 ≤ v+10 (closed upper touch).
  const lo = (v: number): number => Math.ceil((v - K_REACH_LO - CHUNK) / CHUNK);
  for (let cy = lo(by); cy * CHUNK <= by + K_REACH_HI; cy++) {
    for (let cz = lo(bz); cz * CHUNK <= bz + K_REACH_HI; cz++) {
      for (let cx = lo(bx); cx * CHUNK <= bx + K_REACH_HI; cx++) {
        try {
          keys.push(packChunkKey(cx, cy, cz));
        } catch {
          // outside the world
        }
      }
    }
  }
  return keys;
}

interface Transaction {
  id: number;
  startedAt: number;
  pending: Set<number>;
  results: Map<number, MeshResponse>;
}

export interface EditManagerOptions {
  initialEdits?: ReadonlyMap<number, readonly import('../core/sync/lww').IndexedEntry[]>;
  hlcSeed?: import('../core/sync/hlc').HlcStamp;
}

export class EditManager {
  readonly edits = new LwwStore();
  readonly hlc: Hlc;
  readonly sessionId: bigint;
  /** storage hook: fired with the chunk key of every applied edit */
  onEdit: ((chunkKey: number) => void) | null = null;
  /** network hook (M7): fired with every LOCAL entry for broadcast */
  onLocalEntry: ((chunkKey: number, index: number, entry: Entry) => void) | null = null;
  private streaming: Streaming;
  private renderer: Renderer;
  private seed: [number, number];
  private nextTx = 1;
  private transactions = new Map<number, Transaction>();
  private txByChunk = new Map<number, number>();
  /** §9.4: must read 0 during acceptance runs. */
  splitSwapCount = 0;
  editToVisibleMs: number[] = [];
  /** Fired once per atomic swap with the chunk keys it covered. */
  onSwap: ((keys: number[]) => void) | null = null;
  /** Latest job generation per chunk: only the newest job for a key may
   *  deliver into a transaction (older overlapping jobs are ignored). */
  private jobGen = new Map<number, number>();
  private nextGen = 1;
  /** Folded transaction ids → the transaction that absorbed them. */
  private redirect = new Map<number, number>();

  constructor(
    streaming: Streaming,
    renderer: Renderer,
    seed: [number, number],
    options: EditManagerOptions = {},
  ) {
    this.streaming = streaming;
    this.renderer = renderer;
    this.seed = seed;
    this.hlc = new Hlc(options.hlcSeed);
    const rnd = new BigUint64Array(1);
    crypto.getRandomValues(rnd);
    this.sessionId = rnd[0]! | 1n;
    if (options.initialEdits !== undefined) {
      for (const [key, entries] of options.initialEdits) {
        for (const e of entries) this.edits.apply(key, e.index, e);
      }
    }
  }

  /** current world value at a cell, from the streamed cache */
  blockAt(x: number, y: number, z: number): number | null {
    const { cx, cy, cz } = chunkOfCell(x, y, z);
    let key: number;
    try {
      key = packChunkKey(cx, cy, cz);
    } catch {
      return null;
    }
    const rec = this.streaming.chunks.get(key);
    if (rec === undefined) return null;
    if (rec.storage.kind === 'uniform') return rec.storage.value;
    return rec.storage.blocks[localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK)]!;
  }

  editsByChunk(): Map<number, Map<number, number>> {
    const out = new Map<number, Map<number, number>>();
    for (const key of this.edits.chunkKeys()) {
      const m = new Map<number, number>();
      for (const e of this.edits.snapshot(key)) m.set(e.index, e.value);
      out.set(key, m);
    }
    return out;
  }

  /** Review #3: jobs only ever read the 3³ chunk neighbourhood, so only
   *  that slice is serialized — never the whole log. */
  editsForRegion(cx: number, cy: number, cz: number): Map<number, Map<number, number>> {
    const out = new Map<number, Map<number, number>>();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          let key: number;
          try {
            key = packChunkKey(cx + dx, cy + dy, cz + dz);
          } catch {
            continue;
          }
          const raw = this.edits.rawChunk(key);
          if (raw === undefined || raw.size === 0) continue;
          const m = new Map<number, number>();
          for (const [index, e] of raw) m.set(index, e.value);
          out.set(key, m);
        }
      }
    }
    return out;
  }

  /** A remote entry (M7): LWW-apply and refresh the voxel cache at once
   *  (cheap), but BATCH the remeshing — review #3: one transaction per
   *  flush, not per entry, or bulk joins hang the main thread. */
  private pendingRemoteDirty = new Set<number>();

  applyRemoteEntry(chunkKey: number, index: number, entry: Entry): boolean {
    const won = this.edits.apply(chunkKey, index, entry);
    if (!won) return false;
    const rec = this.streaming.chunks.get(chunkKey);
    if (rec !== undefined) {
      if (rec.storage.kind === 'uniform') {
        const blocks = new Uint16Array(CHUNK ** 3).fill(rec.storage.value);
        rec.storage = { kind: 'dense', blocks };
      }
      rec.storage.blocks[index] = entry.value;
    }
    this.onEdit?.(chunkKey);
    const { cx, cy, cz } = unpackKey(chunkKey);
    const lx = index % CHUNK;
    const lz = Math.floor(index / CHUNK) % CHUNK;
    const ly = Math.floor(index / (CHUNK * CHUNK));
    for (const k of dirtyChunksForEdit(cx * CHUNK + lx, cy * CHUNK + ly, cz * CHUNK + lz)) {
      this.pendingRemoteDirty.add(k);
    }
    return won;
  }

  /** Called once per frame (and per session tick in the harness). */
  flushRemote(): void {
    if (this.pendingRemoteDirty.size === 0) return;
    const keys = [...this.pendingRemoteDirty];
    this.pendingRemoteDirty.clear();
    this.dispatchTransaction(keys, PRIORITY.REMOTE_EDIT);
  }

  /** A local edit (§6.3 no-op rule applies). Returns the entry or null. */
  apply(x: number, y: number, z: number, value: number): Entry | null {
    const current = this.blockAt(x, y, z);
    if (current === null || current === value) return null;
    const { cx, cy, cz } = chunkOfCell(x, y, z);
    const key = packChunkKey(cx, cy, cz);
    const index = localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK);
    const stamp = this.hlc.send(Date.now());
    const entry: Entry = { value, l: stamp.l, c: stamp.c, peer: this.sessionId };
    if (!this.edits.apply(key, index, entry)) {
      // An existing entry (e.g. freshly imported within the skew window)
      // outranks this stamp: showing the edit would silently revert on
      // reload — skip every side effect instead.
      return null;
    }

    // voxel cache updates synchronously (§9.4 step 1)
    const rec = this.streaming.chunks.get(key);
    if (rec !== undefined) {
      if (rec.storage.kind === 'uniform') {
        const blocks = new Uint16Array(CHUNK ** 3).fill(rec.storage.value);
        rec.storage = { kind: 'dense', blocks };
      }
      rec.storage.blocks[index] = value;
    }

    this.onEdit?.(key);
    this.onLocalEntry?.(key, index, entry);
    this.dispatchTransaction(dirtyChunksForEdit(x, y, z), PRIORITY.LOCAL_EDIT);
    return entry;
  }

  private dispatchTransaction(keys: number[], priority: typeof PRIORITY.LOCAL_EDIT | typeof PRIORITY.REMOTE_EDIT): void {
    const tx: Transaction = {
      id: this.nextTx++,
      startedAt: performance.now(),
      pending: new Set(),
      results: new Map(),
    };
    this.transactions.set(tx.id, tx);
    for (const key of keys) {
      if (!this.streaming.chunks.has(key)) {
        // Not loaded here — but a STREAMING job may be queued or flying
        // with pre-edit state (review #7): invalidate so it re-runs with
        // the current edits.
        this.streaming.pool.invalidate(key);
        this.streaming.requeueIfKnown(key);
        continue;
      }
      // A newer edit on a chunk an unfinished transaction also covers:
      // FOLD the old transaction into this one (review #10). Swapping the
      // old one's remaining chunks alone would show its edit in some
      // chunks and not in this one — a visible crack. Folded, everything
      // swaps together when the newest job lands.
      const oldTxId = this.txByChunk.get(key);
      if (oldTxId !== undefined && oldTxId !== tx.id) {
        const old = this.transactions.get(oldTxId);
        if (old !== undefined) this.fold(old, tx);
      }
      tx.results.delete(key); // a folded-in result for this key is outdated now
      this.txByChunk.set(key, tx.id);
      tx.pending.add(key);
      this.streaming.pool.invalidate(key);
      // globally unique, so a late job from an earlier cycle can never
      // be mistaken for the newest one after the map entry is cleared
      const gen = this.nextGen++;
      this.jobGen.set(key, gen);
      const { cx, cy, cz } = unpackKey(key);
      this.streaming.pool.request(
        key,
        () => {
          const regionEdits = this.editsForRegion(cx, cy, cz);
          const neighbours = this.neighbourMap(cx, cy, cz);
          const assembled =
            neighbours === null
              ? null
              : assembleRemeshInput(this.seed, cx, cy, cz, neighbours, regionEdits);
          if (assembled !== null) {
            return {
              type: 'remesh' as const,
              key,
              cx, cy, cz,
              nx: assembled.nx, ny: assembled.ny, nz: assembled.nz,
              apron: assembled.apron,
              blocks: assembled.blocks,
              rho: assembled.rho,
              shapeEdited: assembled.shapeEdited,
            };
          }
          return {
            type: 'gen_mesh' as const,
            key,
            seed: this.seed,
            cx, cy, cz,
            edits: serializeRegionEdits(regionEdits),
          };
        },
        priority,
        0,
        (res, status) => this.onMesh(tx.id, key, gen, res, status),
      );
    }
    if (tx.pending.size === 0) this.finish(tx);
  }

  private fold(old: Transaction, into: Transaction): void {
    for (const k of old.pending) {
      into.pending.add(k);
      this.txByChunk.set(k, into.id);
    }
    for (const [k, r] of old.results) {
      into.results.set(k, r);
      this.txByChunk.set(k, into.id);
    }
    into.startedAt = Math.min(into.startedAt, old.startedAt);
    this.transactions.delete(old.id);
    for (const [from, to] of this.redirect) {
      if (to === old.id) this.redirect.set(from, into.id);
    }
    this.redirect.set(old.id, into.id);
  }

  private finish(tx: Transaction): void {
    if (tx.results.size > 0) this.swap(tx);
    this.transactions.delete(tx.id);
    for (const [from, to] of this.redirect) {
      if (to === tx.id) this.redirect.delete(from);
    }
  }

  private neighbourMap(cx: number, cy: number, cz: number): Map<number, import('../core/mesh/assemble').NeighborChunk> | null {
    const out = new Map<number, import('../core/mesh/assemble').NeighborChunk>();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          let key: number;
          try {
            key = packChunkKey(cx + dx, cy + dy, cz + dz);
          } catch {
            continue; // out of world: assembler synthesises
          }
          const rec = this.streaming.chunks.get(key);
          if (rec === undefined) return null;
          out.set(key, rec);
        }
      }
    }
    return out;
  }

  private onMesh(
    txId: number, key: number, gen: number,
    res: MeshResponse | null, status: JobStatus,
  ): void {
    if (this.jobGen.get(key) !== gen) return; // an older job for this chunk
    const tx = this.transactions.get(this.redirect.get(txId) ?? txId);
    if (tx === undefined || this.txByChunk.get(key) !== tx.id) return;
    if (status === 'ok' && res !== null) {
      tx.results.set(key, res);
    } else {
      // cancelled: the chunk was unloaded (review #8) — the transaction
      // must not wait for it forever.
      this.txByChunk.delete(key);
      this.jobGen.delete(key);
    }
    tx.pending.delete(key);
    if (tx.pending.size === 0) this.finish(tx);
  }

  /** §9.4 step 4: every chunk in the transaction swaps render AND
   *  collision buffers in the same frame, bypassing the upload cap. */
  private swap(tx: Transaction): void {
    const frameStart = performance.now();
    this.onSwap?.([...tx.results.keys()]);
    for (const [key, res] of tx.results) {
      this.renderer.removeChunk(key);
      if (res.quadCount > 0) {
        this.renderer.addChunk(key, [res.cx * CHUNK, res.cy * CHUNK, res.cz * CHUNK], {
          vertexData: res.vertexData,
          indexData: res.indexData,
          quadCount: res.quadCount,
        });
      }
      const rec = this.streaming.chunks.get(key);
      if (rec !== undefined) {
        rec.positions = res.positions;
        rec.indexData = res.indexData;
        rec.pickRecords = res.pickRecords;
        rec.pickOffsets = res.pickOffsets;
      }
      this.txByChunk.delete(key);
      this.jobGen.delete(key);
    }
    // All swaps above ran synchronously within one frame; a yield between
    // them would be a split swap.
    if (performance.now() - frameStart > 15) this.splitSwapCount += 1;
    this.editToVisibleMs.push(performance.now() - tx.startedAt);
    if (this.editToVisibleMs.length > 1000) this.editToVisibleMs.shift();
  }
}

function unpackKey(key: number): { cx: number; cy: number; cz: number } {
  const CY_SPAN = 24;
  const CX_SPAN = 2 ** 19;
  const cy = (key % CY_SPAN) - 8;
  const rest = Math.floor(key / CY_SPAN);
  const cz = (rest % CX_SPAN) - 2 ** 18;
  const cx = Math.floor(rest / CX_SPAN) - 2 ** 18;
  return { cx, cy, cz };
}
