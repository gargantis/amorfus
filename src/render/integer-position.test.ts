import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { reconstructRel } from './integer-position';

// §8.3: the shader rebuilds camera-relative positions IN INTEGERS:
// p = (origin − cameraBlock)·256 + pos − 128 (i32), rel = f32(p)/256.
// Exact while |p| < 2²⁴. This TS mirror must give identical values for a
// vertex shared by two chunks at camera positions of ±1e6 (§14 render).
describe('integer camera-relative reconstruction', () => {
  it('a shared vertex reconstructs identically from both owning chunks', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000 / 32, max: 1_000_000 / 32 }),
        fc.integer({ min: -8, max: 15 }),
        fc.integer({ min: -1_000_000 / 32, max: 1_000_000 / 32 }),
        fc.integer({ min: -31_250, max: 31_250 }),
        fc.integer({ min: 0, max: 255 }),
        (cx, cy, cz, camChunkX, sub) => {
          // Chunk A at (cx,cy,cz); chunk B is its +x neighbour. The shared
          // vertex sits on the boundary plane x = (cx+1)·32.
          const cameraBlock: [number, number, number] = [camChunkX * 32, 0, 0];
          // A.1: pos = (chunk-local + 0.5)·256, so the boundary vertex is
          // local 32.0 in A and local 0.0 in B → pos 8320 and 128 (+sub for
          // a fractional offset shared identically by both).
          const relA = reconstructRel(
            [cx * 32, cy * 32, cz * 32],
            [32 * 256 + 128 + sub, 128, 128],
            cameraBlock,
          );
          const relB = reconstructRel(
            [(cx + 1) * 32, cy * 32, cz * 32],
            [128 + sub, 128, 128],
            cameraBlock,
          );
          expect(relA).toEqual(relB);
        },
      ),
    );
  });

  it('matches plain arithmetic near the origin', () => {
    const rel = reconstructRel([32, 0, 0], [128, 384, 128], [30, 1, 0]);
    // world position = 32 + (128-128)/256 = 32.0 → rel x = 2.0
    expect(rel[0]).toBeCloseTo(2.0, 10);
    expect(rel[1]).toBeCloseTo(0.0, 10); // (384-128)/256 = 1.0 above cameraBlock.y=1
    expect(rel[2]).toBeCloseTo(0.0, 10);
  });
});
