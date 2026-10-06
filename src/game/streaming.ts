// §9.1/§15 M4: the streaming world. Keeps the wanted set around the
// camera meshed through the worker pool, caches each chunk's blocks and
// hint state on the main thread (the REMESH inputs), budgets GPU uploads
// per frame, and unloads beyond R + 32.
import { MeshWorkerPool, PRIORITY, serializeEdits } from './worker-pool';
import type { MeshResponse } from '../workers/gen-mesh.worker';
import type { Renderer } from '../render/renderer';
import { pickUploadBatch, type UploadItem } from '../render/upload-budget';
import { CHUNK, packChunkKey } from '../core/world/coords';
import type { NeighborChunk } from '../core/mesh/assemble';
import type { EditsByChunk } from '../core/mesh/gen-mesh';

const CY_MIN = -2;
const CY_MAX = 4;
const UPLOAD_BYTES_PER_FRAME = 2 * 1024 * 1024;
const UPLOAD_MS_PER_FRAME = 1.5;

interface PendingUpload extends UploadItem {
  key: number;
  origin: [number, number, number];
  res: MeshResponse;
}

export interface ChunkRecord extends NeighborChunk {
  /** CPU copies for collision and picking (§9.3). */
  positions: Float32Array;
  indexData: Uint32Array;
  pickRecords: Uint32Array;
  pickOffsets: Uint32Array;
}

export class Streaming {
  readonly pool: MeshWorkerPool;
  private renderer: Renderer;
  private seed: [number, number];
  private editsProvider: () => EditsByChunk;
  private states = new Map<number, 'queued' | 'ready'>();
  readonly chunks = new Map<number, ChunkRecord>();
  private uploads: PendingUpload[] = [];
  private viewRadius: number;
  private lastCameraChunk = Number.NaN;
  private startTime = performance.now();
  firstFillMs: number | null = null;

  constructor(
    renderer: Renderer,
    seed: [number, number],
    viewRadius: number,
    editsProvider: () => EditsByChunk = () => new Map(),
  ) {
    this.renderer = renderer;
    this.seed = seed;
    this.viewRadius = viewRadius;
    this.editsProvider = editsProvider;
    this.pool = new MeshWorkerPool();
  }

  get pendingCount(): number {
    return this.pool.queued + this.pool.inFlight + this.uploads.length;
  }

  update(cameraPos: readonly [number, number, number]): void {
    const ccx = Math.floor(cameraPos[0] / CHUNK);
    const ccz = Math.floor(cameraPos[2] / CHUNK);
    const cameraChunk = ccx * 1e6 + ccz;
    if (cameraChunk !== this.lastCameraChunk) {
      this.lastCameraChunk = cameraChunk;
      this.replan(ccx, ccz, cameraPos);
    }
    this.flushUploads();
    if (this.firstFillMs === null && this.pendingCount === 0 && this.states.size > 0) {
      this.firstFillMs = performance.now() - this.startTime;
    }
  }

  private replan(ccx: number, ccz: number, cameraPos: readonly [number, number, number]): void {
    const cr = Math.ceil(this.viewRadius / CHUNK);
    const wanted = new Set<number>();
    for (let dz = -cr; dz <= cr; dz++) {
      for (let dx = -cr; dx <= cr; dx++) {
        if (dx * dx + dz * dz > cr * cr + 1) continue;
        for (let cy = CY_MIN; cy <= CY_MAX; cy++) {
          let key: number;
          try {
            key = packChunkKey(ccx + dx, cy, ccz + dz);
          } catch {
            continue;
          }
          wanted.add(key);
          if (this.states.has(key)) continue;
          this.states.set(key, 'queued');
          const dist = dx * dx + dz * dz;
          this.pool.request(
            key,
            {
              type: 'gen_mesh',
              key,
              seed: this.seed,
              cx: ccx + dx,
              cy,
              cz: ccz + dz,
              edits: serializeEdits(this.editsProvider()),
            },
            dist <= 1 ? PRIORITY.PHYSICS : PRIORITY.FRUSTUM,
            dist,
            (res, stale) => this.onMesh(res, stale),
          );
        }
      }
    }
    // Unload beyond R + 32 (§9.1).
    const unloadCr = cr + 1;
    for (const key of [...this.states.keys()]) {
      if (wanted.has(key)) continue;
      const { cx, cz } = unpack(key);
      const dx = cx - ccx;
      const dz = cz - ccz;
      if (dx * dx + dz * dz <= unloadCr * unloadCr + 1) continue;
      this.states.delete(key);
      this.chunks.delete(key);
      this.pool.cancel(key);
      this.renderer.removeChunk(key);
      this.uploads = this.uploads.filter((u) => u.key !== key);
    }
    // Closer chunks first after movement.
    this.pool.reprioritise((key) => {
      const { cx, cz } = unpack(key);
      const dx = cx * CHUNK + 16 - cameraPos[0];
      const dz = cz * CHUNK + 16 - cameraPos[2];
      return dx * dx + dz * dz;
    });
  }

  private onMesh(res: MeshResponse, stale: boolean): void {
    if (stale || !this.states.has(res.key)) return; // unloaded or superseded
    if (res.storage !== undefined && res.hints !== undefined) {
      this.chunks.set(res.key, {
        storage: res.storage,
        hints: res.hints,
        positions: res.positions,
        indexData: res.indexData,
        pickRecords: res.pickRecords,
        pickOffsets: res.pickOffsets,
      });
    }
    this.states.set(res.key, 'ready');
    if (res.quadCount > 0) {
      this.uploads.push({
        key: res.key,
        bytes: res.vertexData.byteLength + res.indexData.byteLength,
        group: undefined,
        origin: [res.cx * CHUNK, res.cy * CHUNK, res.cz * CHUNK],
        res,
      });
    }
  }

  private flushUploads(): void {
    if (this.uploads.length === 0) return;
    const start = performance.now();
    const n = pickUploadBatch(this.uploads, UPLOAD_BYTES_PER_FRAME);
    const batch = this.uploads.splice(0, n);
    for (const item of batch) {
      this.renderer.addChunk(item.key, item.origin, {
        vertexData: item.res.vertexData,
        indexData: item.res.indexData,
        quadCount: item.res.quadCount,
      });
      if (performance.now() - start > UPLOAD_MS_PER_FRAME && n > 1) {
        // Time cap: push the rest back for the next frame.
        const idx = batch.indexOf(item);
        this.uploads.unshift(...batch.slice(idx + 1));
        break;
      }
    }
  }
}

function unpack(key: number): { cx: number; cz: number } {
  // inverse of packChunkKey for the x/z parts (§6.2 layout)
  const CY_SPAN = 24;
  const CX_SPAN = 2 ** 19;
  const rest = Math.floor(key / CY_SPAN);
  const cz = (rest % CX_SPAN) - 2 ** 18;
  const cx = Math.floor(rest / CX_SPAN) - 2 ** 18;
  return { cx, cz };
}
