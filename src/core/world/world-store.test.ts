import { describe, it, expect } from 'vitest';
import { WorldStore } from './world-store';
import { generateChunk } from '../gen/v1/index';
import { materialOf, makeBlock, AIR } from './block';
import { CHUNK, chunkOfCell, localIndex, packChunkKey } from './coords';

// §6.3: W(cell) = edits.has(cell) ? edits.value : G(seed, cell). Chunk data
// is a cache. No-op edits are not written; placing the generated value back
// over an edit IS written (the entry stays, shapeEdited turns false later).

const SEED: [number, number] = [0xdeadbeef, 0x12345678];
const PLANKS = makeBlock(5, false);

function generatedValueAt(x: number, y: number, z: number): number {
  const { cx, cy, cz } = chunkOfCell(x, y, z);
  const g = generateChunk(SEED, cx, cy, cz);
  if (g.storage.kind === 'uniform') return g.storage.value;
  return g.storage.blocks[localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK)]!;
}

describe('WorldStore', () => {
  it('reads generated values before any edit', () => {
    const w = new WorldStore(SEED);
    for (const [x, y, z] of [[0, 0, 0], [5, 40, 9], [-3, -70, 17], [100, 300, -50]] as const) {
      expect(w.blockAt(x, y, z)).toBe(generatedValueAt(x, y, z));
    }
  });

  it('applies a local edit and refuses a no-op', () => {
    const w = new WorldStore(SEED);
    const before = w.blockAt(2, 2, 2);
    expect(w.localEdit(2, 2, 2, before, { l: 1, c: 0 }, 1n)).toBeNull();
    const entry = w.localEdit(2, 2, 2, PLANKS, { l: 2, c: 0 }, 1n);
    expect(entry).not.toBeNull();
    expect(w.blockAt(2, 2, 2)).toBe(PLANKS);
  });

  it('writes an entry when placing the generated value back over an edit', () => {
    const w = new WorldStore(SEED);
    const original = w.blockAt(4, 4, 4);
    w.localEdit(4, 4, 4, PLANKS, { l: 1, c: 0 }, 1n);
    const back = w.localEdit(4, 4, 4, original, { l: 2, c: 0 }, 1n);
    expect(back).not.toBeNull();
    expect(w.blockAt(4, 4, 4)).toBe(original);
    const { cx, cy, cz } = chunkOfCell(4, 4, 4);
    const key = packChunkKey(cx, cy, cz);
    expect(w.edits.entriesInChunk(key)).toBe(1);
  });

  it('applies remote entries through LWW and updates the cached voxels', () => {
    const w = new WorldStore(SEED);
    const { cx, cy, cz } = chunkOfCell(7, 7, 7);
    const key = packChunkKey(cx, cy, cz);
    const idx = localIndex(7 - cx * CHUNK, 7 - cy * CHUNK, 7 - cz * CHUNK);
    w.blockAt(7, 7, 7); // warm the cache
    expect(w.applyRemote(key, idx, { value: PLANKS, l: 10, c: 0, peer: 9n })).toBe(true);
    expect(w.blockAt(7, 7, 7)).toBe(PLANKS);
    // an older remote entry loses and leaves the voxel alone
    expect(w.applyRemote(key, idx, { value: AIR, l: 5, c: 0, peer: 3n })).toBe(false);
    expect(w.blockAt(7, 7, 7)).toBe(PLANKS);
  });

  it('edits inside a uniform chunk work (uniform is only a storage kind)', () => {
    const w = new WorldStore(SEED);
    // deep uniform stone chunk
    const x = 3 * CHUNK + 1;
    const y = -8 * CHUNK + 1;
    const z = -2 * CHUNK + 1;
    expect(materialOf(w.blockAt(x, y, z))).not.toBe(0);
    w.localEdit(x, y, z, AIR, { l: 1, c: 0 }, 1n);
    expect(w.blockAt(x, y, z)).toBe(AIR);
    expect(w.blockAt(x + 1, y, z)).toBe(generatedValueAt(x + 1, y, z));
  });
});
