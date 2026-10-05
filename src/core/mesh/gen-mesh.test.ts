import { describe, it, expect } from 'vitest';
import { buildGenMeshInput, meshGeneratedChunk } from './gen-mesh';
import { assembleRemeshInput, type NeighborChunk } from './assemble';
import { meshRegion } from './mesher';
import { generateChunk } from '../gen/v1/index';
import { CHUNK, packChunkKey, localIndex } from '../world/coords';
import { makeBlock } from '../world/block';

// §7.5/§9.1: GEN_MESH builds its region from the generator plus edits;
// REMESH assembles the same region from loaded chunks and hint states.
// They must agree byte for byte (§14), and the 38³ shortcut must equal
// the 52³ result when nothing within reach is shape-edited.

const SEED: [number, number] = [7, 7];
const PLANKS = makeBlock(5, false);
const SHARP_BRICK = makeBlock(6, true);

type EditMap = Map<number, Map<number, number>>;

function edit(edits: EditMap, cx: number, cy: number, cz: number, lx: number, ly: number, lz: number, v: number): void {
  const key = packChunkKey(cx, cy, cz);
  if (!edits.has(key)) edits.set(key, new Map());
  edits.get(key)!.set(localIndex(lx, ly, lz), v);
}

/** Neighbour chunks as the main thread holds them: CURRENT blocks (edits
 *  applied), with the GENERATED hint state. */
function neighborhood(cx: number, cy: number, cz: number, edits: EditMap = new Map()): Map<number, NeighborChunk> {
  const out = new Map<number, NeighborChunk>();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = packChunkKey(cx + dx, cy + dy, cz + dz);
        const g = generateChunk(SEED, cx + dx, cy + dy, cz + dz);
        let storage = g.storage;
        const chunkEdits = edits.get(key);
        if (chunkEdits !== undefined && chunkEdits.size > 0) {
          const blocks =
            storage.kind === 'dense'
              ? storage.blocks.slice()
              : new Uint16Array(CHUNK ** 3).fill(storage.value);
          for (const [index, value] of chunkEdits) blocks[index] = value;
          storage = { kind: 'dense', blocks };
        }
        out.set(key, { storage, hints: g.hints });
      }
    }
  }
  return out;
}

describe('gen-mesh and remesh', () => {
  it('uses the 38³ region when nothing within reach is shape-edited', () => {
    const { apron } = buildGenMeshInput(SEED, 0, 0, 0, new Map());
    expect(apron).toBe(3);
  });

  it('a material-only edit on hinted ground keeps the 38³ shortcut (§7.5)', () => {
    const edits: EditMap = new Map();
    // find a solid surface block and repaint it with the same shape:
    // non-sharp solid where the hint already says solid.
    const g = generateChunk(SEED, 0, 0, 0);
    expect(g.storage.kind).toBe('dense');
    if (g.storage.kind !== 'dense') return;
    let li = -1;
    for (let i = 0; i < g.storage.blocks.length; i++) {
      if (g.storage.blocks[i] !== 0) {
        li = i;
        break;
      }
    }
    expect(li).toBeGreaterThanOrEqual(0);
    edits.set(packChunkKey(0, 0, 0), new Map([[li, PLANKS]]));
    const { apron } = buildGenMeshInput(SEED, 0, 0, 0, edits);
    expect(apron).toBe(3);
    // and the mesh carries the new material at that block's faces
    const m = meshGeneratedChunk(SEED, 0, 0, 0, edits);
    expect(m.quadCount).toBeGreaterThan(0);
  });

  it('a shape edit forces the 52³ region', () => {
    // Dig out a cell the generator makes solid: always a shape edit.
    const g = generateChunk(SEED, 0, 0, 0);
    expect(g.storage.kind).toBe('dense');
    if (g.storage.kind !== 'dense') return;
    let li = -1;
    for (let i = 0; i < g.storage.blocks.length; i++) {
      if (g.storage.blocks[i] !== 0) {
        li = i;
        break;
      }
    }
    const edits: EditMap = new Map([[packChunkKey(0, 0, 0), new Map([[li, 0]])]]);
    const { apron } = buildGenMeshInput(SEED, 0, 0, 0, edits);
    expect(apron).toBe(10);
  });

  it('a sharp edit forces the 52³ region even if occupancy matches', () => {
    const g = generateChunk(SEED, 0, 0, 0);
    if (g.storage.kind !== 'dense') return;
    let li = -1;
    for (let i = 0; i < g.storage.blocks.length; i++) {
      if (g.storage.blocks[i] !== 0) {
        li = i;
        break;
      }
    }
    const edits: EditMap = new Map([[packChunkKey(0, 0, 0), new Map([[li, SHARP_BRICK]])]]);
    expect(buildGenMeshInput(SEED, 0, 0, 0, edits).apron).toBe(10);
  });

  it('REMESH ≡ GEN_MESH byte for byte, no edits, next to uniform chunks', () => {
    // cy = 1 has air-uniform neighbours above in places.
    for (const [cx, cy, cz] of [[0, 0, 0], [3, 1, 2]] as const) {
      const gen = meshGeneratedChunk(SEED, cx, cy, cz, new Map());
      const assembled = assembleRemeshInput(SEED, cx, cy, cz, neighborhood(cx, cy, cz), new Map());
      expect(assembled).not.toBeNull();
      const rem = meshRegion(assembled!);
      expect(new Uint8Array(rem.vertexData)).toEqual(new Uint8Array(gen.vertexData));
      expect(rem.indexData).toEqual(gen.indexData);
      expect(rem.pickRecords).toEqual(gen.pickRecords);
    }
  });

  it('REMESH ≡ GEN_MESH with shape edits near a chunk corner', () => {
    const edits: EditMap = new Map();
    edit(edits, 0, 0, 0, 1, 20, 1, PLANKS);
    edit(edits, -1, 0, 0, 31, 20, 0, PLANKS); // across the corner
    const gen = meshGeneratedChunk(SEED, 0, 0, 0, edits);
    const assembled = assembleRemeshInput(SEED, 0, 0, 0, neighborhood(0, 0, 0, edits), edits);
    const rem = meshRegion(assembled!);
    expect(new Uint8Array(rem.vertexData)).toEqual(new Uint8Array(gen.vertexData));
    expect(rem.indexData).toEqual(gen.indexData);
  });

  it('REMESH reports null when a neighbour is missing', () => {
    const n = neighborhood(0, 0, 0);
    n.delete(packChunkKey(1, 0, 0));
    expect(assembleRemeshInput(SEED, 0, 0, 0, n, new Map())).toBeNull();
  });

  it('the 38³ shortcut equals the 52³ result on unedited terrain (§7.5)', () => {
    const short = meshGeneratedChunk(SEED, 2, 0, 5, new Map());
    const full = meshGeneratedChunk(SEED, 2, 0, 5, new Map(), { forceApron: 10 });
    expect(new Uint8Array(short.vertexData)).toEqual(new Uint8Array(full.vertexData));
    expect(short.indexData).toEqual(full.indexData);
  });
});
