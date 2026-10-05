import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  CHUNK,
  WORLD_X_MIN,
  WORLD_X_MAX,
  WORLD_Y_MIN,
  WORLD_Y_MAX,
  inWorldBounds,
  chunkOfCell,
  localIndex,
  cellOfIndex,
  packChunkKey,
  unpackChunkKey,
} from './coords';

// §6.2: 32³ chunks keyed by (cx, cy, cz) packed into ONE safe-integer
// Number. World bounds are protocol constants of generator v1:
// x, z ∈ [−2²³, 2²³), y ∈ [−256, 512). A.2: index = (y·32 + z)·32 + x.
describe('coords', () => {
  it('exposes the v1 protocol constants', () => {
    expect(CHUNK).toBe(32);
    expect(WORLD_X_MIN).toBe(-(2 ** 23));
    expect(WORLD_X_MAX).toBe(2 ** 23);
    expect(WORLD_Y_MIN).toBe(-256);
    expect(WORLD_Y_MAX).toBe(512);
  });

  it('bounds-checks cells', () => {
    expect(inWorldBounds(0, 0, 0)).toBe(true);
    expect(inWorldBounds(WORLD_X_MIN, WORLD_Y_MIN, WORLD_X_MIN)).toBe(true);
    expect(inWorldBounds(WORLD_X_MAX, 0, 0)).toBe(false);
    expect(inWorldBounds(0, WORLD_Y_MAX, 0)).toBe(false);
    expect(inWorldBounds(0, -257, 0)).toBe(false);
  });

  it('maps cells to chunks with floor semantics for negatives', () => {
    expect(chunkOfCell(0, 0, 0)).toEqual({ cx: 0, cy: 0, cz: 0 });
    expect(chunkOfCell(31, 31, 31)).toEqual({ cx: 0, cy: 0, cz: 0 });
    expect(chunkOfCell(-1, -1, -1)).toEqual({ cx: -1, cy: -1, cz: -1 });
    expect(chunkOfCell(-32, 32, 63)).toEqual({ cx: -1, cy: 1, cz: 1 });
  });

  it('computes the A.2 local index layout', () => {
    expect(localIndex(0, 0, 0)).toBe(0);
    expect(localIndex(1, 0, 0)).toBe(1);
    expect(localIndex(0, 0, 1)).toBe(32);
    expect(localIndex(0, 1, 0)).toBe(1024);
    expect(localIndex(31, 31, 31)).toBe(32767);
    expect(cellOfIndex(localIndex(7, 13, 21))).toEqual({ x: 7, y: 13, z: 21 });
  });

  it('packs chunk keys bijectively across the whole world', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -(2 ** 18), max: 2 ** 18 - 1 }),
        fc.integer({ min: -8, max: 15 }),
        fc.integer({ min: -(2 ** 18), max: 2 ** 18 - 1 }),
        (cx, cy, cz) => {
          const key = packChunkKey(cx, cy, cz);
          expect(Number.isSafeInteger(key)).toBe(true);
          expect(unpackChunkKey(key)).toEqual({ cx, cy, cz });
        },
      ),
    );
  });

  it('gives distinct keys for distinct chunks', () => {
    const keys = new Set<number>();
    for (const [cx, cy, cz] of [
      [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
      [-1, 0, 0], [0, -1, 0], [0, 0, -1], [-(2 ** 18), -8, -(2 ** 18)],
      [2 ** 18 - 1, 15, 2 ** 18 - 1],
    ] as const) {
      keys.add(packChunkKey(cx, cy, cz));
    }
    expect(keys.size).toBe(9);
  });
});
