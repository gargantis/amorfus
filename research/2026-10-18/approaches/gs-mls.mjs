// GS best: context-aware caps (a) + a windowed exact solve (b): every
// relaxed vertex is placed on the weighted least-squares quadric of the
// mesh-connected vertices within lattice radius 5 (a converged solve of a
// world-anchored window problem, so seam-exact at apron 10), then one
// undamped Jacobi step inside the constraint box.
import { meshRegion } from '../work/gs/mesher-gs.mjs';
export const name = 'gs-mls';
export const describe = 'Context-aware D-3 caps + midpoint edited edges + R dilated 1; R vertices move onto a weighted quadric fit of their radius-5 connected window (exact solve per window, seam-exact at apron 10), then 1 Jacobi step (λ = 1) in the box.';
export const apron = 10;
export const params = { capMode: 'context', editMid: true, rDilate: 1, solver: 'mls', mlsR2: 25, mlsDegree: 2, mlsDot: 0.3, postK: 1, lambda: 1, mlsCone: true };
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params }));
}
