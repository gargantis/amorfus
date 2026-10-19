// gn-grad (REJECTED, kept to show why): gn-best AO with σ = 2 cubic
// B-spline density-gradient normals near smooth edits. Best numbers on
// built slopes, but it flips normals (> 90°) under thin features near other
// mass: a 1-thick ledge over ground, a roof 2 above a floor, two walls 1 apart.
import { meshRegion } from '../work/gn/mesher-gn.mjs';
import { PARAMS as BEST } from './gn-best.mjs';
export const name = 'gn-grad';
export const describe = 'gn-best AO; σ=2 B-spline density-gradient normals near smooth edits (rejected: flips under thin features).';
export const PARAMS = { ...BEST, normalRule: 'grad', normalPv: 'rho', normalSigma: 2, normalFromD0: false };
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params: PARAMS }));
}
