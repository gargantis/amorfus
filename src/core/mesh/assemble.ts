// §9.1 REMESH: assemble the 52³ mesh input from LOADED chunks (current
// blocks, edits applied) and their hint states — no generator call. A
// `saturated` neighbour supplies ±127 from its blocks, which is exact for
// unedited cells; an EDITED cell inside a saturated chunk cannot reveal
// its GENERATED occupancy, so that case returns null and the caller falls
// back to GEN_MESH (ruling recorded in the ledger). Any missing neighbour
// or hint state also returns null. Must reproduce GEN_MESH byte for byte.
import { CHUNK, packChunkKey } from '../world/coords';
import { materialOf, isSharp, AIR, makeBlock, MATERIALS } from '../world/block';
import type { MeshRegionInput, MeshParams } from './mesher';
import type { EditsByChunk } from './gen-mesh';

export interface NeighborChunk {
  /** CURRENT storage: generated values with edits already applied. */
  storage: { kind: 'uniform'; value: number } | { kind: 'dense'; blocks: Uint16Array };
  /** GENERATED hint state; edits never change it. */
  hints: Int8Array | 'saturated';
}

const APRON = 10;
const STONE = makeBlock(MATERIALS.indexOf('stone'), false);

export function assembleRemeshInput(
  seed: readonly [number, number],
  cx: number, cy: number, cz: number,
  neighbours: ReadonlyMap<number, NeighborChunk>,
  edits: EditsByChunk,
  params?: Partial<MeshParams>,
): MeshRegionInput | null {
  void seed; // REMESH never calls the generator; kept for API symmetry
  const n = CHUNK + 2 * APRON;
  const blocks = new Uint16Array(n * n * n);
  const rho = new Float32Array(n * n * n);
  const shapeEdited = new Uint8Array(n * n * n);

  const bx = cx * CHUNK - APRON;
  const by = cy * CHUNK - APRON;
  const bz = cz * CHUNK - APRON;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ncx = cx + dx;
        const ncy = cy + dy;
        const ncz = cz + dz;
        const ox = ncx * CHUNK;
        const oy = ncy * CHUNK;
        const oz = ncz * CHUNK;
        const x0 = Math.max(ox, bx);
        const x1 = Math.min(ox + CHUNK, bx + n);
        const y0 = Math.max(oy, by);
        const y1 = Math.min(oy + CHUNK, by + n);
        const z0 = Math.max(oz, bz);
        const z1 = Math.min(oz + CHUNK, bz + n);
        if (x0 >= x1 || y0 >= y1 || z0 >= z1) continue;

        let nb: NeighborChunk | undefined;
        let chunkEdits: ReadonlyMap<number, number> | undefined;
        try {
          const key = packChunkKey(ncx, ncy, ncz);
          nb = neighbours.get(key);
          chunkEdits = edits.get(key);
        } catch {
          // Outside the world (§6.2): below is stone, above is air.
          const value = ncy < -8 ? STONE : ncy > 15 ? AIR : null;
          if (value === null) return null; // x/z beyond world bounds
          nb = {
            storage: { kind: 'uniform', value },
            hints: 'saturated',
          };
        }
        if (nb === undefined) return null;

        for (let y = y0; y < y1; y++) {
          for (let z = z0; z < z1; z++) {
            for (let x = x0; x < x1; x++) {
              const ri = ((y - by) * n + (z - bz)) * n + (x - bx);
              const li = ((y - oy) * CHUNK + (z - oz)) * CHUNK + (x - ox);
              const value = nb.storage.kind === 'uniform' ? nb.storage.value : nb.storage.blocks[li]!;
              blocks[ri] = value;
              const edited = chunkEdits?.has(li) === true;
              if (nb.hints === 'saturated') {
                if (edited) {
                  // The generated occupancy at an edited cell is not
                  // recoverable from a saturated chunk: fall back.
                  return null;
                }
                rho[ri] = materialOf(value) !== AIR ? 1 : -1;
                continue;
              }
              const genHint = nb.hints[li]!;
              if (edited && (isSharp(value) || (materialOf(value) !== AIR) !== genHint > 0)) {
                shapeEdited[ri] = 1;
                rho[ri] = materialOf(value) !== AIR ? 1 : -1;
              } else {
                rho[ri] = genHint / 127;
              }
            }
          }
        }
      }
    }
  }

  return { nx: n, ny: n, nz: n, apron: APRON, blocks, rho, shapeEdited, params };
}
