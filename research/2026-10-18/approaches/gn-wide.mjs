// gn-wide: gn-best with the 3-ring taken on RELAXED positions (smoother built
// slopes, best diagonal) — needs apron 13 in edited regions instead of 10.
import { meshRegion } from '../work/gn/mesher-gn.mjs';
import { PARAMS as BEST } from './gn-best.mjs';
export const name = 'gn-wide';
export const describe = 'gn-best with the edit-zone 3-ring on relaxed positions (needs apron 13 where edits are near).';
export const PARAMS = { ...BEST, normalFromD0: false };
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params: PARAMS }));
}
