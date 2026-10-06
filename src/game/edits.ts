// §9.4 edit transactions. An edit writes the log and the voxel cache
// synchronously, dirties up to 8 chunks (§7.5), dispatches them as ONE
// transaction at P0/P1, and when every dirty chunk's mesh has returned,
// swaps render AND collision buffers in the same frame — the split-swap
// counter must stay 0.
import { CHUNK, chunkOfCell, packChunkKey, localIndex } from '../core/world/coords';
import { Hlc } from '../core/sync/hlc';
import { LwwStore, type Entry } from '../core/sync/lww';
import { assembleRemeshInput } from '../core/mesh/assemble';
import type { Streaming } from './streaming';
import { PRIORITY, serializeEdits } from './worker-pool';
import type { MeshResponse } from '../workers/gen-mesh.worker';
import type { Renderer } from '../render/renderer';

const K_REACH_LO = 9; // k + 3 (§7.5)
const K_REACH_HI = 10; // k + 4

/** The chunks whose corner range meets [b−9, b+10] on every axis. */
export function dirtyChunksForEdit(bx: number, by: number, bz: number): number[] {
  const keys: number[] = [];
  // A chunk's corner range is [c·32, c·32+32]; it meets [v−9, v+10] for
  // c from floor((v−9)/32) while c·32 ≤ v+10.
  const lo = (v: number): number => Math.floor((v - K_REACH_LO) / CHUNK);
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
  private streaming: Streaming;
  private renderer: Renderer;
  private seed: [number, number];
  private nextTx = 1;
  private transactions = new Map<number, Transaction>();
  private txByChunk = new Map<number, number>();
  /** §9.4: must read 0 during acceptance runs. */
  splitSwapCount = 0;
  editToVisibleMs: number[] = [];

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

  /** A local edit (§6.3 no-op rule applies). Returns the entry or null. */
  apply(x: number, y: number, z: number, value: number): Entry | null {
    const current = this.blockAt(x, y, z);
    if (current === null || current === value) return null;
    const { cx, cy, cz } = chunkOfCell(x, y, z);
    const key = packChunkKey(cx, cy, cz);
    const index = localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK);
    const stamp = this.hlc.send(Date.now());
    const entry: Entry = { value, l: stamp.l, c: stamp.c, peer: this.sessionId };
    this.edits.apply(key, index, entry);

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
    const editsFlat = serializeEdits(this.editsByChunk());
    for (const key of keys) {
      if (!this.streaming.chunks.has(key)) continue; // not loaded → streaming will GEN_MESH later
      // A newer transaction supersedes an older one on the same chunk:
      // release the chunk from the old one so it cannot leak half-done.
      const oldTxId = this.txByChunk.get(key);
      if (oldTxId !== undefined) {
        const old = this.transactions.get(oldTxId);
        if (old !== undefined) {
          old.pending.delete(key);
          old.results.delete(key);
          if (old.pending.size === 0) {
            if (old.results.size > 0) this.swap(old);
            this.transactions.delete(oldTxId);
          }
        }
      }
      this.txByChunk.set(key, tx.id);
      tx.pending.add(key);
      this.streaming.pool.invalidate(key);
      const { cx, cy, cz } = unpackKey(key);
      const neighbours = this.neighbourMap(cx, cy, cz);
      const assembled = neighbours === null
        ? null
        : assembleRemeshInput(this.seed, cx, cy, cz, neighbours, this.editsByChunk());
      if (assembled !== null) {
        this.streaming.pool.request(
          key,
          {
            type: 'remesh',
            key,
            cx, cy, cz,
            nx: assembled.nx, ny: assembled.ny, nz: assembled.nz,
            apron: assembled.apron,
            blocks: assembled.blocks,
            rho: assembled.rho,
            shapeEdited: assembled.shapeEdited,
          },
          priority,
          0,
          (res, stale) => this.onMesh(tx.id, res, stale),
        );
      } else {
        this.streaming.pool.request(
          key,
          { type: 'gen_mesh', key, seed: this.seed, cx, cy, cz, edits: editsFlat },
          priority,
          0,
          (res, stale) => this.onMesh(tx.id, res, stale),
        );
      }
    }
    if (tx.pending.size > 0) this.transactions.set(tx.id, tx);
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

  private onMesh(txId: number, res: MeshResponse, stale: boolean): void {
    const tx = this.transactions.get(txId);
    if (tx === undefined) return;
    if (this.txByChunk.get(res.key) !== txId) return; // superseded
    if (stale) {
      // an even newer edit invalidated this: its transaction covers us
      tx.pending.delete(res.key);
    } else {
      tx.results.set(res.key, res);
      tx.pending.delete(res.key);
    }
    if (tx.pending.size === 0) {
      this.swap(tx);
      this.transactions.delete(txId);
    }
  }

  /** §9.4 step 4: every chunk in the transaction swaps render AND
   *  collision buffers in the same frame, bypassing the upload cap. */
  private swap(tx: Transaction): void {
    const frameStart = performance.now();
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
