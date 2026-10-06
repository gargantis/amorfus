// §9.1 job scheduling: priorities, the streaming in-flight cap that keeps
// a worker free for edits, stale tracking, and cheap reprioritisation.
// In-flight jobs are tracked by TOKEN, not chunk key: several jobs for
// one key may overlap when edits outpace meshing, and results must never
// be cross-delivered (review finding #4).

export const PRIORITY = {
  LOCAL_EDIT: 0,
  REMOTE_EDIT: 1,
  PHYSICS: 2,
  FRUSTUM: 3,
  REST: 4,
} as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export interface Job {
  key: number; // chunk key
  priority: Priority;
  distance: number;
}

interface InFlight {
  key: number;
  priority: Priority;
  version: number;
  cancelled: boolean;
}

const isEdit = (p: Priority): boolean => p <= PRIORITY.REMOTE_EDIT;

export class JobQueue {
  private queued = new Map<number, Job>();
  private inFlight = new Map<number, InFlight>(); // by token
  private versions = new Map<number, number>(); // by key
  private streamingInFlight = 0;
  private streamingCap: number;
  private nextToken = 1;

  constructor(poolSize: number) {
    this.streamingCap = Math.min(2, Math.max(1, poolSize - 1));
  }

  push(job: Job): void {
    const existing = this.queued.get(job.key);
    if (existing === undefined || job.priority < existing.priority ||
        (job.priority === existing.priority && job.distance < existing.distance)) {
      this.queued.set(job.key, job);
    }
  }

  /** Returns true when a QUEUED (not yet dispatched) job was dropped. */
  cancel(key: number): boolean {
    const hadQueued = this.queued.delete(key);
    for (const f of this.inFlight.values()) {
      if (f.key === key) f.cancelled = true;
    }
    return hadQueued;
  }

  /** An edit arrived for this chunk: every in-flight job for it is stale. */
  invalidate(key: number): void {
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
  }

  /** Next dispatchable job, honouring the streaming cap; null when none. */
  take(): (Job & { token: number; version: number }) | null {
    let best: Job | null = null;
    for (const job of this.queued.values()) {
      if (!isEdit(job.priority) && this.streamingInFlight >= this.streamingCap) continue;
      if (
        best === null ||
        job.priority < best.priority ||
        (job.priority === best.priority && job.distance < best.distance)
      ) {
        best = job;
      }
    }
    if (best === null) return null;
    this.queued.delete(best.key);
    if (!isEdit(best.priority)) this.streamingInFlight += 1;
    const token = this.nextToken++;
    const version = this.versions.get(best.key) ?? 0;
    this.inFlight.set(token, { key: best.key, priority: best.priority, version, cancelled: false });
    return { ...best, token, version };
  }

  /** 'ok' | 'stale' (invalidated after dispatch) | 'cancelled' (unloaded). */
  statusOf(token: number): 'ok' | 'stale' | 'cancelled' {
    const f = this.inFlight.get(token);
    if (f === undefined || f.cancelled) return 'cancelled';
    return (this.versions.get(f.key) ?? 0) !== f.version ? 'stale' : 'ok';
  }

  complete(token: number): void {
    const f = this.inFlight.get(token);
    if (f === undefined) return;
    this.inFlight.delete(token);
    if (!isEdit(f.priority)) this.streamingInFlight -= 1;
  }

  reprioritise(distanceOf: (key: number) => number): void {
    for (const job of this.queued.values()) job.distance = distanceOf(job.key);
  }

  get queuedCount(): number {
    return this.queued.size;
  }

  get inFlightCount(): number {
    return this.inFlight.size;
  }
}
