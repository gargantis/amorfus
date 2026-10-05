// §9.1 job scheduling: priorities, the streaming in-flight cap that keeps
// a worker free for edits, stale tracking, and cheap reprioritisation.
// Pure bookkeeping — the pool wires it to real Workers.

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
  version?: number;
}

const isEdit = (p: Priority): boolean => p <= PRIORITY.REMOTE_EDIT;

export class JobQueue {
  private queued = new Map<number, Job>();
  private inFlight = new Map<number, { job: Job; stale: boolean }>();
  private versions = new Map<number, number>();
  private streamingInFlight = 0;
  private streamingCap: number;

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

  cancel(key: number): void {
    this.queued.delete(key);
  }

  /** An edit arrived for an in-flight chunk: its result is stale (§9.1). */
  invalidate(key: number): void {
    const f = this.inFlight.get(key);
    if (f !== undefined) f.stale = true;
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
  }

  isStale(key: number, version?: number): boolean {
    const f = this.inFlight.get(key);
    if (f?.stale === true) return true;
    return version !== undefined && version !== (this.versions.get(key) ?? 0);
  }

  /** Next dispatchable job, honouring the streaming cap; null when none. */
  take(): (Job & { version: number }) | null {
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
    const version = this.versions.get(best.key) ?? 0;
    this.inFlight.set(best.key, { job: best, stale: false });
    return { ...best, version };
  }

  complete(key: number): void {
    const f = this.inFlight.get(key);
    if (f === undefined) return;
    this.inFlight.delete(key);
    if (!isEdit(f.job.priority)) this.streamingInFlight -= 1;
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
