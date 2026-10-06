// §9.3 picking: Amanatides–Woo DDA over blocks; at each block test the
// quads whose lower block is within Chebyshev distance 1 (sufficient
// because every vertex stays inside its cell); Möller–Trumbore on both
// triangles; nearest hit wins.
import { trianglesInBox, type TriangleSource, type Tri } from './collision';

export interface PickHit {
  t: number;
  position: [number, number, number];
  /** remove target */
  solidBlock: [number, number, number];
  /** place target */
  airBlock: [number, number, number];
  axis: number;
}

const EPS = 1e-7;

function rayTriangle(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  tri: Tri,
): number | null {
  const e1x = tri.bx - tri.ax;
  const e1y = tri.by - tri.ay;
  const e1z = tri.bz - tri.az;
  const e2x = tri.cx - tri.ax;
  const e2y = tri.cy - tri.ay;
  const e2z = tri.cz - tri.az;
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -EPS && det < EPS) return null;
  const inv = 1 / det;
  const tx = ox - tri.ax;
  const ty = oy - tri.ay;
  const tz = oz - tri.az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -EPS || u > 1 + EPS) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -EPS || u + v > 1 + EPS) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > EPS ? t : null;
}

export function pickRay(
  source: TriangleSource,
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  reach: number,
): PickHit | null {
  const [ox, oy, oz] = origin;
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < EPS) return null;
  const dx = dir[0] / len;
  const dy = dir[1] / len;
  const dz = dir[2] / len;

  // DDA state
  let bx = Math.floor(ox);
  let by = Math.floor(oy);
  let bz = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? bx + 1 - ox : ox - bx) * tDeltaX) : Infinity;
  let tMaxY = dy !== 0 ? ((dy > 0 ? by + 1 - oy : oy - by) * tDeltaY) : Infinity;
  let tMaxZ = dz !== 0 ? ((dz > 0 ? bz + 1 - oz : oz - bz) * tDeltaZ) : Infinity;

  let best: PickHit | null = null;
  let cellEntry = 0;

  for (let steps = 0; steps < 2 * reach + 8; steps++) {
    // Candidate quads: lower blocks within Chebyshev 1 of this cell.
    const tris = trianglesInBox(source, bx - 1, by - 1, bz - 1, bx + 1, by + 1, bz + 1);
    for (const tri of tris) {
      const t = rayTriangle(ox, oy, oz, dx, dy, dz, tri);
      if (t === null || t > reach) continue;
      if (best === null || t < best.t) {
        const rec = tri.chunk.pickRecords[tri.quad]!;
        const lowerLocal = rec & 0x7fff;
        const axis = (rec >> 15) & 3;
        const lowerIsSolid = ((rec >> 17) & 1) === 1;
        const lx = lowerLocal % 32;
        const lz = Math.floor(lowerLocal / 32) % 32;
        const ly = Math.floor(lowerLocal / 1024);
        const lower: [number, number, number] = [
          tri.chunk.origin[0] + lx,
          tri.chunk.origin[1] + ly,
          tri.chunk.origin[2] + lz,
        ];
        const upper: [number, number, number] = [...lower];
        upper[axis] = upper[axis]! + 1;
        best = {
          t,
          position: [ox + dx * t, oy + dy * t, oz + dz * t],
          solidBlock: lowerIsSolid ? lower : upper,
          airBlock: lowerIsSolid ? upper : lower,
          axis,
        };
      }
    }
    const cellExit = Math.min(tMaxX, tMaxY, tMaxZ);
    // A confirmed hit before the exit of the current cell cannot be beaten
    // by later cells (vertices stay within ±1 of their lower block).
    if (best !== null && best.t <= cellExit) return best;
    if (cellEntry > reach) break;
    cellEntry = cellExit;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      bx += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY <= tMaxZ) {
      by += stepY;
      tMaxY += tDeltaY;
    } else {
      bz += stepZ;
      tMaxZ += tDeltaZ;
    }
  }
  return best !== null && best.t <= reach ? best : null;
}
