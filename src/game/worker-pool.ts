// §9.1: clamp(hardwareConcurrency − 2, 2, 6) module workers fed from the
// JobQueue. Streaming stays under its in-flight cap; edits always find a
// worker. Stale results (an edit arrived mid-flight) are dropped and
// requeued by the owner of the callback.
import { JobQueue, PRIORITY, type Priority } from './job-queue';
import type { WorkerRequest, MeshResponse } from '../workers/gen-mesh.worker';
import type { EditsByChunk } from '../core/mesh/gen-mesh';

export type MeshCallback = (res: MeshResponse, stale: boolean) => void;

/** Omit that distributes over a union (TS's Omit collapses unions). */
type DistributedOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type PoolRequest = DistributedOmit<WorkerRequest, 'id' | 'version'>;

interface PendingJob {
  request: PoolRequest;
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

export class MeshWorkerPool {
  private workers: Worker[] = [];
  private idle: number[] = [];
  private queue: JobQueue;
  private pending = new Map<number, PendingJob>(); // by chunk key
  private running = new Map<number, { key: number }>(); // by worker index
  private nextId = 1;
  jobsCompleted = 0;

  constructor(size = defaultPoolSize()) {
    this.queue = new JobQueue(size);
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('../workers/gen-mesh.worker.ts', import.meta.url), {
        type: 'module',
      });
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
    request: PoolRequest,
    priority: Priority,
    distance: number,
    cb: MeshCallback,
  ): void {
    this.pending.set(key, { request, cb });
    this.queue.push({ key, priority, distance });
    this.dispatch();
  }

  cancel(key: number): void {
    this.queue.cancel(key);
    this.pending.delete(key);
  }

  /** An edit arrived: any in-flight result for this chunk is stale. */
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
      const p = this.pending.get(job.key);
      if (p === undefined) {
        this.queue.complete(job.key);
        continue;
      }
      const wi = this.idle.pop()!;
      this.running.set(wi, { key: job.key });
      const req = { ...p.request, id: this.nextId++, version: job.version } as WorkerRequest;
      const transfer: Transferable[] = [];
      if (req.type === 'remesh') {
        transfer.push(req.blocks.buffer, req.rho.buffer, req.shapeEdited.buffer);
      }
      this.workers[wi]!.postMessage(req, transfer);
    }
  }

  private onResult(workerIndex: number, res: MeshResponse): void {
    this.idle.push(workerIndex);
    this.running.delete(workerIndex);
    const stale = this.queue.isStale(res.key, res.version);
    this.queue.complete(res.key);
    const p = this.pending.get(res.key);
    this.pending.delete(res.key);
    this.jobsCompleted += 1;
    p?.cb(res, stale);
    this.dispatch();
  }

  destroy(): void {
    for (const w of this.workers) w.terminate();
  }
}

export { PRIORITY };
