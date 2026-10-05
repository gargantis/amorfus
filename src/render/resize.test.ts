import { describe, it, expect } from 'vitest';
import { computeCanvasSize, TIERS } from './resize';

// D-26/§8.4: internal resolution is always capped. Rendering at full DPR
// would push 5 MP on a 2.8K panel; Medium caps at 2.1 MP.
describe('computeCanvasSize', () => {
  it('uses full DPR when under the cap', () => {
    const s = computeCanvasSize({ cssWidth: 800, cssHeight: 600, dpr: 1, pixelCapMP: 2.1 });
    expect(s).toEqual({ width: 800, height: 600, scale: 1 });
  });

  it('caps a 2.8K panel at 2.1 MP', () => {
    const s = computeCanvasSize({ cssWidth: 1440, cssHeight: 900, dpr: 2, pixelCapMP: 2.1 });
    expect(s.width * s.height).toBeLessThanOrEqual(2.1e6 * 1.01);
    expect(s.scale).toBeLessThan(2);
    expect(s.width / s.height).toBeCloseTo(1440 / 900, 1);
  });

  it('never emits zero dimensions', () => {
    const s = computeCanvasSize({ cssWidth: 1, cssHeight: 1, dpr: 0.5, pixelCapMP: 1.2 });
    expect(s.width).toBeGreaterThanOrEqual(1);
    expect(s.height).toBeGreaterThanOrEqual(1);
  });

  it('exposes the §8.4 tier table', () => {
    expect(TIERS.low.pixelCapMP).toBe(1.2);
    expect(TIERS.medium.pixelCapMP).toBe(2.1);
    expect(TIERS.high.pixelCapMP).toBe(3.7);
    expect(TIERS.medium.msaa).toBe(4);
    expect(TIERS.low.msaa).toBe(1);
    expect(TIERS.low.viewRadius).toBe(128);
    expect(TIERS.high.viewRadius).toBe(256);
  });
});
