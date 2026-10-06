// §9.1: clamp(hardwareConcurrency − 2, 2, 6) module workers fed from the
// JobQueue. Results route by JOB ID — several jobs for one chunk may
// overlap when edits outpace meshing, and the newest mesh must never be
// lost to a stale sibling (review finding #4). Requests are BUILT at
// dispatch time, so a job queued before an edit still serializes the
// current edit state (finding #7).
import { JobQueue, PRIORITY, type Priority } from './job-queue';
import type { WorkerRequest, MeshResponse } from '../workers/gen-mesh.worker';
import type { EditsByChunk } from '../core/mesh/gen-mesh';

export type JobStatus = 'ok' | 'stale' | 'cancelled';
/** res is null exactly when status is 'cancelled' before completion. */
export type MeshCallback = (res: MeshResponse | null, status: JobStatus) => void;

/** Omit that distributes over a union (TS's Omit collapses unions). */
type DistributedOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type PoolRequest = DistributedOmit<WorkerRequest, 'id' | 'version'>;

interface PendingRequest {
  build: () => PoolRequest;
  cb: MeshCallback;
}

interface DispatchedJob {
  key: number;
  cb: MeshCallback;
}

export function defaultPoolSize(): number {
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4;
  return Math.min(6, Math.max(2, (hc || 4) - 2));
}

export function serializeEdits(edits: EditsByChunk): Array<[number, number[]]> {
  const out: Array<[number, number[]]> = [];
  for (const [key, m] of edits) {
    const pairs: number[] = [];
    for (const [i, v] of m) pairs.push(i, v);
    out.push([key, pairs]);
  }
  return out;
}

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent) => void) | null;
  terminate(): void;
}

function realWorkerFactory(): WorkerLike {
  return new Worker(new URL('../workers/gen-mesh.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

export class MeshWorkerPool {
  private workers: WorkerLike[] = [];
  private idle: number[] = [];
  private queue: JobQueue;
  private pendingByKey = new Map<number, PendingRequest>();
  private jobsById = new Map<number, DispatchedJob>();
  jobsCompleted = 0;

  constructor(size = defaultPoolSize(), factory: () => WorkerLike = realWorkerFactory) {
    this.queue = new JobQueue(size);
    for (let i = 0; i < size; i++) {
      const w = factory();
      w.onmessage = (ev: MessageEvent) => this.onResult(i, ev.data as MeshResponse);
      this.workers.push(w);
      this.idle.push(i);
    }
  }

  get size(): number {
    return this.workers.length;
  }

  get queued(): number {
    return this.queue.queuedCount;
  }

  get inFlight(): number {
    return this.queue.inFlightCount;
  }

  request(
    key: number,
    build: () => PoolRequest,
    priority: Priority,
    distance: number,
    cb: MeshCallback,
  ): void {
    this.pendingByKey.set(key, { build, cb });
    this.queue.push({ key, priority, distance });
    this.dispatch();
  }

  /** Unload: a queued job is dropped (its owner hears 'cancelled' at
   *  once); in-flight jobs report 'cancelled' when they return. */
  cancel(key: number): void {
    const hadQueued = this.queue.cancel(key);
    const p = this.pendingByKey.get(key);
    this.pendingByKey.delete(key);
    if (hadQueued && p !== undefined) p.cb(null, 'cancelled');
  }

  /** An edit arrived: in-flight jobs for this chunk become stale. */
  invalidate(key: number): void {
    this.queue.invalidate(key);
  }

  reprioritise(distanceOf: (key: number) => number): void {
    this.queue.reprioritise(distanceOf);
  }

  private dispatch(): void {
    while (this.idle.length > 0) {
      const job = this.queue.take();
      if (job === null) return;
      const p = this.pendingByKey.get(job.key);
      if (p === undefined) {
        this.queue.complete(job.token);
        continue;
      }
      const wi = this.idle.pop()!;
      this.jobsById.set(job.token, { key: job.key, cb: p.cb });
      const req = { ...p.build(), id: job.token, version: job.version } as WorkerRequest;
      const transfer: Transferable[] = [];
      if (req.type === 'remesh') {
        transfer.push(req.blocks.buffer, req.rho.buffer, req.shapeEdited.buffer);
      }
      this.workers[wi]!.postMessage(req, transfer);
    }
  }

  private onResult(workerIndex: number, res: MeshResponse): void {
    this.idle.push(workerIndex);
    const job = this.jobsById.get(res.id);
    this.jobsById.delete(res.id);
    const status = this.queue.statusOf(res.id);
    this.queue.complete(res.id);
    this.jobsCompleted += 1;
    job?.cb(res, status);
    this.dispatch();
  }

  destroy(): void {
    for (const w of this.workers) w.terminate();
  }
}

export { PRIORITY };
