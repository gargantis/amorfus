// §9.3 shared geometry access: "what you see is what you hit" — collision
// and picking read each chunk's CPU copy of positions, indices and pick
// records, never the voxels.
import { CHUNK, chunkOfCell, localIndex } from '../world/coords';

export interface ChunkTriangles {
  origin: readonly [number, number, number];
  positions: Float32Array; // chunk-local xyz per vertex
  indexData: Uint32Array; // 6 per quad
  pickRecords: Uint32Array; // lowerLocalIndex | axis<<15 | lowerIsSolid<<17
  pickOffsets: Uint32Array; // CSR by lower block local index
}

export interface TriangleSource {
  /** null means not loaded — §9.3: chunks that aren't ready count solid. */
  chunkAt(cx: number, cy: number, cz: number): ChunkTriangles | null;
}

export interface Tri {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
  quad: number; // quad index within its chunk
  chunk: ChunkTriangles;
}

/** Visit both triangles of every quad whose LOWER block is the given world
 *  cell — reading from whichever chunk holds that lower block (§9.3). */
export function trianglesOfLowerBlock(
  source: TriangleSource,
  x: number, y: number, z: number,
  out: Tri[],
): void {
  const { cx, cy, cz } = chunkOfCell(x, y, z);
  const chunk = source.chunkAt(cx, cy, cz);
  if (chunk === null) return;
  const li = localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK);
  const start = chunk.pickOffsets[li]!;
  const end = chunk.pickOffsets[li + 1]!;
  for (let q = start; q < end; q++) {
    for (let t = 0; t < 2; t++) {
      const i0 = chunk.indexData[q * 6 + t * 3]!;
      const i1 = chunk.indexData[q * 6 + t * 3 + 1]!;
      const i2 = chunk.indexData[q * 6 + t * 3 + 2]!;
      out.push({
        ax: chunk.positions[i0 * 3]! + chunk.origin[0],
        ay: chunk.positions[i0 * 3 + 1]! + chunk.origin[1],
        az: chunk.positions[i0 * 3 + 2]! + chunk.origin[2],
        bx: chunk.positions[i1 * 3]! + chunk.origin[0],
        by: chunk.positions[i1 * 3 + 1]! + chunk.origin[1],
        bz: chunk.positions[i1 * 3 + 2]! + chunk.origin[2],
        cx: chunk.positions[i2 * 3]! + chunk.origin[0],
        cy: chunk.positions[i2 * 3 + 1]! + chunk.origin[1],
        cz: chunk.positions[i2 * 3 + 2]! + chunk.origin[2],
        quad: q,
        chunk,
      });
    }
  }
}

/** All triangles whose lower block lies in the inclusive world-cell box. */
export function trianglesInBox(
  source: TriangleSource,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
): Tri[] {
  const out: Tri[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        trianglesOfLowerBlock(source, x, y, z, out);
      }
    }
  }
  return out;
}
