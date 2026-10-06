import { describe, it, expect } from 'vitest';
import { computeGenCanary, chunkGoldenHash } from './canary';
import goldens from './gen/v1/goldens.json';

// C-10 (review #11): the canary is COMPUTED by the running engine at
// startup and compared with the frozen golden — a bundled constant would
// be identical on every engine and prove nothing.
describe('generator canary', () => {
  const g = (goldens as Array<{ seed: [number, number]; chunk: [number, number, number]; hash: string }>)[0]!;

  it('hashes a chunk exactly as the goldens were built', async () => {
    expect(await chunkGoldenHash(g.seed, g.chunk)).toBe(g.hash);
  });

  it('is ok on a conforming engine, with the canary taken from the computed hash', async () => {
    const r = await computeGenCanary();
    expect(r.ok).toBe(true);
    expect(r.canary).toBe(parseInt(g.hash.slice(0, 8), 16) >>> 0);
  });

  it('reports a mismatch when the computed hash differs from the expectation', async () => {
    const r = await computeGenCanary('00'.repeat(32));
    expect(r.ok).toBe(false);
    // the canary still reflects what THIS engine computes, so the
    // handshake refuses peers whose terrain differs
    expect(r.canary).toBe(parseInt(g.hash.slice(0, 8), 16) >>> 0);
  });
});
