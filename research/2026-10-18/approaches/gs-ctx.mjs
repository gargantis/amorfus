// GS (relax edited terrain where safe), step (a) only: context-aware D-3
// caps + midpoint crossings at edited edges + R dilated by 1; the §7.3
// damped Jacobi (k = 6) is unchanged. Patched mesher: work/gs/src/core/mesh/mesher.ts.
import { meshRegion } from '../work/gs/mesher-gs.mjs';
export const name = 'gs-ctx';
export const describe = 'Hints rule; D-3 caps only where an opening is tight (headroom ≤ 2, 1-wide gap) or at the foot of a ≥ 2-high wall; edited edges cross at midpoints; R dilated 1; k = 6 Jacobi.';
export const apron = 10;
export const params = { capMode: 'context', editMid: true, rDilate: 1 };
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params }));
}
