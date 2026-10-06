import { describe, it, expect } from 'vitest';
import { dirtyChunksForEdit } from './edits';
import { packChunkKey } from '../core/world/coords';

// §7.5: an edit at b dirties every chunk whose corner range meets
// [b − k − 3, b + k + 4] = [b − 9, b + 10] on every axis — at most 8
// chunks, about 4.3 on average.
describe('dirtyChunksForEdit', () => {
  it('an interior edit dirties only its own chunk', () => {
    expect(dirtyChunksForEdit(16, 16, 16)).toEqual([packChunkKey(0, 0, 0)]);
  });

  it('an edit near a face dirties the neighbour too', () => {
    const keys = dirtyChunksForEdit(2, 16, 16); // within 9 of the −x face
    expect(keys).toContain(packChunkKey(0, 0, 0));
    expect(keys).toContain(packChunkKey(-1, 0, 0));
    expect(keys).toHaveLength(2);
  });

  it('a corner edit dirties all 8 chunks', () => {
    const keys = dirtyChunksForEdit(0, 32, 64);
    expect(keys).toHaveLength(8);
    expect(keys).toContain(packChunkKey(0, 1, 2));
    expect(keys).toContain(packChunkKey(-1, 0, 1));
  });

  it('includes the −side neighbour at the exact-touch alignment (review #9)', () => {
    // v = 9: box [0, 19]; chunk −1's corner range [−32, 0] touches at 0,
    // exactly as the +side single-point touch does.
    expect(dirtyChunksForEdit(9, 16, 16)).toContain(packChunkKey(-1, 0, 0));
    // v = 10: box [1, 20] no longer touches chunk −1.
    expect(dirtyChunksForEdit(10, 16, 16)).toHaveLength(1);
  });

  it('the reach is asymmetric: −9 vs +10', () => {
    // at local 22: 22+10 = 32 → touches the +x neighbour's corner range
    expect(dirtyChunksForEdit(22, 16, 16)).toHaveLength(2);
    // at local 23: 23−9 = 14, 23+10 = 33 > 32 boundary… corner range of
    // the next chunk starts at 32; [14, 33] meets it.
    expect(dirtyChunksForEdit(23, 16, 16)).toContain(packChunkKey(1, 0, 0));
    // at local 21: [12, 31] stays inside
    expect(dirtyChunksForEdit(21, 16, 16)).toHaveLength(1);
  });
});
