import { describe, it, expect } from 'vitest';
import { JobQueue, PRIORITY } from './job-queue';

// §9.1: priorities P0 local edits, P1 remote edits, P2 physics region,
// P3 in-frustum by distance, P4 rest. Streaming jobs are capped at
// min(2, pool−1) in flight so at least one worker is always free for
// edits; edit jobs are never starved.
describe('JobQueue', () => {
  it('dispatches by priority, then by distance within a class', () => {
    const q = new JobQueue(4);
    q.push({ key: 1, priority: PRIORITY.REST, distance: 5 });
    q.push({ key: 2, priority: PRIORITY.FRUSTUM, distance: 9 });
    q.push({ key: 3, priority: PRIORITY.FRUSTUM, distance: 2 });
    q.push({ key: 4, priority: PRIORITY.LOCAL_EDIT, distance: 99 });
    const takeDone = (): number | undefined => {
      const j = q.take();
      if (j) q.complete(j.key);
      return j?.key;
    };
    expect(takeDone()).toBe(4);
    expect(takeDone()).toBe(3);
    expect(takeDone()).toBe(2);
    expect(takeDone()).toBe(1);
    expect(q.take()).toBeNull();
  });

  it('caps streaming jobs at min(2, pool−1) while edits still dispatch', () => {
    const q = new JobQueue(3); // cap = min(2, 2) = 2
    q.push({ key: 1, priority: PRIORITY.FRUSTUM, distance: 1 });
    q.push({ key: 2, priority: PRIORITY.FRUSTUM, distance: 2 });
    q.push({ key: 3, priority: PRIORITY.FRUSTUM, distance: 3 });
    expect(q.take()?.key).toBe(1);
    expect(q.take()?.key).toBe(2);
    expect(q.take()).toBeNull(); // streaming cap reached
    q.push({ key: 9, priority: PRIORITY.LOCAL_EDIT, distance: 0 });
    expect(q.take()?.key).toBe(9); // edits bypass the streaming cap
    q.complete(1);
    expect(q.take()?.key).toBe(3);
  });

  it('replaces a queued job for the same key with the higher priority', () => {
    const q = new JobQueue(4);
    q.push({ key: 7, priority: PRIORITY.REST, distance: 4 });
    q.push({ key: 7, priority: PRIORITY.REMOTE_EDIT, distance: 4 });
    const job = q.take();
    expect(job?.priority).toBe(PRIORITY.REMOTE_EDIT);
    expect(q.take()).toBeNull(); // only one job for the key
  });

  it('drops a queued job when cancelled (unload)', () => {
    const q = new JobQueue(4);
    q.push({ key: 5, priority: PRIORITY.REST, distance: 1 });
    q.cancel(5);
    expect(q.take()).toBeNull();
  });

  it('marks stale in-flight jobs for requeue on completion', () => {
    const q = new JobQueue(4);
    q.push({ key: 3, priority: PRIORITY.FRUSTUM, distance: 1 });
    const job = q.take()!;
    expect(job.key).toBe(3);
    q.invalidate(3); // an edit arrived mid-flight (§9.1 stale rule)
    expect(q.isStale(3, job.version)).toBe(true);
    q.complete(3);
    // caller requeues with the new version at edit priority
  });

  it('reprioritises queued streaming jobs on camera movement', () => {
    const q = new JobQueue(4);
    q.push({ key: 1, priority: PRIORITY.FRUSTUM, distance: 10 });
    q.push({ key: 2, priority: PRIORITY.FRUSTUM, distance: 20 });
    q.reprioritise((key) => (key === 2 ? 1 : 15));
    expect(q.take()?.key).toBe(2);
  });
});
