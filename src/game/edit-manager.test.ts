import { describe, it, expect } from 'vitest';
import { EditManager } from './edits';
import { MeshWorkerPool, type WorkerLike } from './worker-pool';
import type { Streaming, ChunkRecord } from './streaming';
import type { Renderer } from '../render/renderer';
import { packChunkKey } from '../core/world/coords';
import { makeBlock, AIR } from '../core/world/block';

// §9.4 through the real EditManager + pool, with fake workers and a fake
// renderer: review #10 (a superseded transaction must never swap a
// partial set — that is the visible crack), #8 (unload must not strand a
// transaction), #3 (jobs carry only their region's edits).

const PLANKS = makeBlock(5, false);
const A = packChunkKey(0, 0, 0);
const B = packChunkKey(-1, 0, 0);

interface SentJob {
  id: number;
  key: number;
  raw: Record<string, unknown>;
}

class FakeWorker implements WorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  sent: SentJob[] = [];
  postMessage(message: unknown): void {
    const m = message as { id: number; key: number };
    this.sent.push({ id: m.id, key: m.key, raw: message as Record<string, unknown> });
  }
  terminate(): void {}
  finishJob(job: SentJob): void {
    this.sent.splice(this.sent.indexOf(job), 1);
    this.onmessage?.({
      data: {
        type: 'mesh', id: job.id, key: job.key, version: 0,
        cx: 0, cy: 0, cz: 0,
        vertexData: new ArrayBuffer(0), vertexCount: 0,
        indexData: new Uint32Array(0), quadCount: 0,
        positions: new Float32Array(0),
        pickRecords: new Uint32Array(0), pickOffsets: new Uint32Array(1),
      },
    } as MessageEvent);
  }
}

function rig() {
  const workers: FakeWorker[] = [];
  const pool = new MeshWorkerPool(4, () => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  const chunks = new Map<number, ChunkRecord>();
  const record = (): ChunkRecord => ({
    storage: { kind: 'uniform', value: AIR },
    hints: 'saturated',
    positions: new Float32Array(0),
    indexData: new Uint32Array(0),
    pickRecords: new Uint32Array(0),
    pickOffsets: new Uint32Array(1),
  });
  chunks.set(A, record());
  chunks.set(B, record());
  const requeued: number[] = [];
  const streaming = {
    chunks,
    pool,
    requeueIfKnown: (key: number) => requeued.push(key),
  } as unknown as Streaming;
  const removed: number[] = [];
  const renderer = {
    removeChunk: (key: number) => removed.push(key),
    addChunk: () => void 0,
  } as unknown as Renderer;
  const em = new EditManager(streaming, renderer, [1, 1]);
  const swaps: number[][] = [];
  em.onSwap = (keys) => swaps.push([...keys].sort((x, y) => x - y));

  /** outstanding jobs for a chunk key, oldest first */
  const jobsFor = (key: number): Array<{ w: FakeWorker; job: SentJob }> =>
    workers
      .flatMap((w) => w.sent.filter((j) => j.key === key).map((job) => ({ w, job })))
      .sort((x, y) => x.job.id - y.job.id);
  const finishOldest = (key: number): void => {
    const first = jobsFor(key)[0];
    if (first === undefined) throw new Error(`no outstanding job for ${key}`);
    first.w.finishJob(first.job);
  };
  return { em, pool, chunks, removed, swaps, jobsFor, finishOldest, requeued };
}

describe('EditManager transactions', () => {
  it('swaps every chunk of a transaction together', () => {
    const r = rig();
    r.em.apply(2, 16, 16, PLANKS); // near the −x face: dirties A and B
    expect(r.jobsFor(A)).toHaveLength(1);
    expect(r.jobsFor(B)).toHaveLength(1);
    r.finishOldest(B);
    expect(r.swaps).toEqual([]); // A still pending: nothing may swap
    r.finishOldest(A);
    expect(r.swaps).toEqual([[A, B].sort((x, y) => x - y)]);
    expect(r.em.splitSwapCount).toBe(0);
  });

  it('never swaps a partial set when a newer edit supersedes (review #10)', () => {
    const r = rig();
    r.em.apply(2, 16, 16, PLANKS); // tx1: {A, B}
    r.em.apply(16, 16, 16, PLANKS); // tx2: {A} — supersedes A only
    expect(r.jobsFor(A)).toHaveLength(2); // old job still flying + the new one
    // B's result (computed for tx1) returns first. Swapping B alone would
    // show edit 1 in B while A still shows the pre-edit mesh: a crack.
    r.finishOldest(B);
    expect(r.removed).toEqual([]);
    expect(r.swaps).toEqual([]);
    r.finishOldest(A); // tx1's A job: stale, ignored
    expect(r.swaps).toEqual([]);
    r.finishOldest(A); // the newest A job
    expect(r.swaps).toEqual([[A, B].sort((x, y) => x - y)]);
  });

  it('a burst of edits on one chunk ends with the NEWEST mesh swapped (review #4)', () => {
    const r = rig();
    for (let i = 0; i < 5; i++) r.em.apply(12 + i, 16, 16, PLANKS); // all interior to A
    // finish every outstanding A job, oldest first
    while (r.jobsFor(A).length > 0) r.finishOldest(A);
    expect(r.swaps).toHaveLength(1);
    expect(r.swaps[0]).toEqual([A]);
  });

  it('an unloaded chunk does not strand its transaction (review #8)', () => {
    const r = rig();
    r.em.apply(2, 16, 16, PLANKS); // {A, B}
    // B unloads while its job is in flight
    r.chunks.delete(B);
    r.pool.cancel(B);
    r.finishOldest(B); // returns 'cancelled'
    r.finishOldest(A);
    expect(r.swaps).toEqual([[A]]);
  });

  it('jobs carry only their own region’s edits (review #3)', () => {
    const r = rig();
    const far = packChunkKey(40, 0, 40);
    r.em.edits.apply(far, 5, { value: PLANKS, l: 1, c: 0, peer: 9n });
    r.em.apply(16, 16, 16, PLANKS);
    const job = r.jobsFor(A)[0]!.job;
    const edits = job.raw['edits'] as Array<[number, number[]]>;
    expect(edits.map(([k]) => k)).toEqual([A]);
  });

  it('remote entries batch into one transaction per flush (review #3)', () => {
    const r = rig();
    for (let i = 0; i < 20; i++) {
      r.em.applyRemoteEntry(A, 1000 + i, { value: PLANKS, l: 10 + i, c: 0, peer: 3n });
    }
    expect(r.jobsFor(A)).toHaveLength(0); // nothing dispatched per entry
    r.em.flushRemote();
    expect(r.jobsFor(A)).toHaveLength(1);
  });

  it('an edit touching a not-yet-meshed chunk asks streaming to rerun it (review #7)', () => {
    const r = rig();
    r.chunks.delete(B); // B is still queued for its first mesh
    r.em.apply(2, 16, 16, PLANKS);
    expect(r.requeued).toContain(B);
  });
});
