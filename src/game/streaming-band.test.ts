import { describe, it, expect } from 'vitest';
import { chunkBandFor } from './streaming-band';

// Review #14: the streamed vertical band follows the camera. A fixed band
// left every chunk above y = 160 unloaded, and unready chunks collide as
// solid — an invisible ceiling 8 blocks above the tallest mountain.
describe('chunkBandFor', () => {
  it('covers the terrain band by default', () => {
    expect(chunkBandFor(40)).toEqual([-2, 4]);
  });

  it('extends upward with a high camera', () => {
    const [lo, hi] = chunkBandFor(300);
    expect(lo).toBe(-2);
    expect(hi).toBe(Math.floor(300 / 32) + 1);
  });

  it('extends downward with a deep camera', () => {
    const [lo, hi] = chunkBandFor(-150);
    expect(lo).toBe(Math.floor(-150 / 32) - 1);
    expect(hi).toBe(4);
  });

  it('never leaves the world', () => {
    expect(chunkBandFor(10_000)[1]).toBe(15);
    expect(chunkBandFor(-10_000)[0]).toBe(-8);
  });
});
