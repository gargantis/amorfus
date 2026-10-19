// GS oracle, NOT seam-safe: context-aware caps + today's Jacobi membrane
// iterated to convergence (max |Δ| < 1e-5). Shows what "relax to
// convergence" converges to.
import { meshRegion } from '../work/gs/mesher-gs.mjs';
export const name = 'gs-conv';
export const describe = 'ORACLE (not seam-safe): context-aware caps + midpoint edited edges; the §7.3 membrane Jacobi iterated to convergence (tol 1e-5, 200–8000 iterations).';
export const apron = 10;
export const params = { capMode: 'context', editMid: true, rDilate: 1, solver: 'fid', mu: 0, tol: 1e-5, maxIter: 20000 };
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params }));
}
