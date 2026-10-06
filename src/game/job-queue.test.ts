import { describe, it, expect } from 'vitest';
import { JobQueue, PRIORITY } from './job-queue';
import { MeshWorkerPool, type WorkerLike } from './worker-pool';
import type { MeshResponse } from '../workers/gen-mesh.worker';

// §9.1 scheduling + review finding #4: results route by job id, so a
// burst of edits on one chunk can overlap jobs without the newest mesh
// being lost or cross-delivered.

describe('JobQueue', () => {
  it('dispatches by priority, then by distance within a class', () => {
    const q = new JobQueue(4);
    q.push({ key: 1, priority: PRIORITY.REST, distance: 5 });
    q.push({ key: 2, priority: PRIORITY.FRUSTUM, distance: 9 });
    q.push({ key: 3, priority: PRIORITY.FRUSTUM, distance: 2 });
    q.push({ key: 4, priority: PRIORITY.LOCAL_EDIT, distance: 99 });
    const takeDone = (): number | undefined => {
      const j = q.take();
      if (j) q.complete(j.token);
      return j?.key;
    };
    expect(takeDone()).toBe(4);
    expect(takeDone()).toBe(3);
    expect(takeDone()).toBe(2);
    expect(takeDone()).toBe(1);
    expect(q.take()).toBeNull();
  });

  it('caps streaming jobs at min(2, pool−1) while edits still dispatch', () => {
    const q = new JobQueue(3);
    q.push({ key: 1, priority: PRIORITY.FRUSTUM, distance: 1 });
    q.push({ key: 2, priority: PRIORITY.FRUSTUM, distance: 2 });
    q.push({ key: 3, priority: PRIORITY.FRUSTUM, distance: 3 });
    const j1 = q.take()!;
    expect(j1.key).toBe(1);
    expect(q.take()?.key).toBe(2);
    expect(q.take()).toBeNull(); // streaming cap reached
    q.push({ key: 9, priority: PRIORITY.LOCAL_EDIT, distance: 0 });
    expect(q.take()?.key).toBe(9); // edits bypass the streaming cap
    q.complete(j1.token);
    expect(q.take()?.key).toBe(3);
  });

  it('allows overlapping in-flight jobs for one key, tracked separately', () => {
    const q = new JobQueue(4);
    q.push({ key: 7, priority: PRIORITY.LOCAL_EDIT, distance: 0 });
    const first = q.take()!;
    q.invalidate(7); // an edit arrives mid-flight
    q.push({ key: 7, priority: PRIORITY.LOCAL_EDIT, distance: 0 });
    const second = q.take()!;
    expect(second.token).not.toBe(first.token);
    expect(q.statusOf(first.token)).toBe('stale');
    expect(q.statusOf(second.token)).toBe('ok');
    q.complete(first.token);
    q.complete(second.token);
  });

  it('cancel drops queued jobs and marks in-flight ones cancelled', () => {
    const q = new JobQueue(4);
    q.push({ key: 5, priority: PRIORITY.REST, distance: 1 });
    expect(q.cancel(5)).toBe(true);
    expect(q.take()).toBeNull();
    q.push({ key: 6, priority: PRIORITY.REST, distance: 1 });
    const j = q.take()!;
    expect(q.cancel(6)).toBe(false);
    expect(q.statusOf(j.token)).toBe('cancelled');
  });
});

// ---- pool with fake workers ----

class FakeWorker implements WorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  sent: Array<{ id: number; key: number; edits?: unknown }> = [];
  postMessage(message: unknown): void {
    const m = message as { id: number; key: number; edits?: unknown };
    this.sent.push({ id: m.id, key: m.key, edits: m.edits });
  }
  terminate(): void {}
  /** complete the oldest outstanding request */
  finish(extra: Partial<MeshResponse> = {}): void {
    const m = this.sent.shift()!;
    this.onmessage?.({
      data: {
        type: 'mesh', id: m.id, key: m.key, version: 0,
        cx: 0, cy: 0, cz: 0,
        vertexData: new ArrayBuffer(0), vertexCount: 0,
        indexData: new Uint32Array(0), quadCount: 0,
        positions: new Float32Array(0),
        pickRecords: new Uint32Array(0), pickOffsets: new Uint32Array(1),
        ...extra,
      },
    } as MessageEvent);
  }
}

function fakeGenRequest(key: number) {
  return () => ({
    type: 'gen_mesh' as const,
    key,
    seed: [1, 1] as [number, number],
    cx: 0, cy: 0, cz: 0,
    edits: [],
  });
}

describe('MeshWorkerPool (finding #4)', () => {
  it('a burst of requests on one key delivers the NEWEST result to its own callback', () => {
    const workers: FakeWorker[] = [];
    const pool = new MeshWorkerPool(2, () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const delivered: Array<[string, string]> = [];
    pool.request(7, fakeGenRequest(7), PRIORITY.LOCAL_EDIT, 0, (_r, status) =>
      delivered.push(['tx1', status]),
    );
    // edit 2 arrives before the first job returns
    pool.invalidate(7);
    pool.request(7, fakeGenRequest(7), PRIORITY.LOCAL_EDIT, 0, (_r, status) =>
      delivered.push(['tx2', status]),
    );
    // both jobs are now dispatched (2 workers)
    const outstanding = workers.flatMap((w) => w.sent.map(() => w));
    expect(outstanding).toHaveLength(2);
    // first job returns stale, SECOND must still deliver ok to tx2
    workers[0]!.finish();
    const second = workers[0]!.sent.length === 0 ? workers[1]! : workers[0]!;
    second.finish();
    expect(delivered).toContainEqual(['tx1', 'stale']);
    expect(delivered).toContainEqual(['tx2', 'ok']);
  });

  it('cancel notifies a queued request immediately', () => {
    const pool = new MeshWorkerPool(1, () => new FakeWorker());
    const statuses: string[] = [];
    // occupy the single worker
    pool.request(1, fakeGenRequest(1), PRIORITY.FRUSTUM, 0, () => void 0);
    pool.request(2, fakeGenRequest(2), PRIORITY.FRUSTUM, 0, (_r, s) => statuses.push(s));
    pool.cancel(2);
    expect(statuses).toEqual(['cancelled']);
  });

  it('requests are built at dispatch time, not request time', () => {
    const worker = new FakeWorker();
    const pool = new MeshWorkerPool(1, () => worker);
    let edits: Array<[number, number[]]> = [];
    pool.request(1, fakeGenRequest(1), PRIORITY.FRUSTUM, 0, () => void 0);
    pool.request(
      3,
      () => ({ type: 'gen_mesh' as const, key: 3, seed: [1, 1] as [number, number], cx: 0, cy: 0, cz: 0, edits }),
      PRIORITY.FRUSTUM,
      1,
      () => void 0,
    );
    // the edit lands while key 3 is still queued
    edits = [[3, [0, 5]]];
    worker.finish(); // frees the worker → key 3 dispatches NOW
    const sent = worker.sent[worker.sent.length - 1];
    expect(sent?.key).toBe(3);
    // the dispatched request carries the POST-edit state (review #7)
    expect(sent?.edits).toEqual([[3, [0, 5]]]);
  });
});
