// GS oracle, NOT seam-safe: context-aware caps + a converged thin-plate
// (umbrella²) solve with weak fidelity μ = 0.01, box-constrained, FISTA.
import { meshRegion } from '../work/gs/mesher-gs.mjs';
export const name = 'gs-tp';
export const describe = 'ORACLE (not seam-safe): context-aware caps + midpoint edited edges; converged box-constrained thin plate with fidelity μ = 0.01 (FISTA, 1000–2000 iterations).';
export const apron = 10;
export const params = { capMode: 'context', editMid: true, rDilate: 1, solver: 'bilap', mu: 0.01, tol: 1e-6, maxIter: 20000 };
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params }));
}
