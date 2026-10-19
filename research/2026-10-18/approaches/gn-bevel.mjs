// gn-bevel: does gn shading rescue the §7.9 bevel geometry? Bevel positions
// (byte-identical to the bevel rule), faceted flag off, gn-best AO, and the
// 3-ring mean normal on EVERY vertex (the bevel geometry is terraced
// everywhere, not only near edits). Bevel has no relaxation, so the ring
// reads the final positions: reach 4 corners + guard/caps → apron 7, not 3.
import { meshRegion } from '../work/gn/mesher-gn.mjs';
import { PARAMS as BEST } from './gn-best.mjs';
export const name = 'gn-bevel';
export const describe = 'Bevel geometry, smooth (not faceted) shading: gn-best AO and 3-ring mean normals on every vertex.';
export const PARAMS = { ...BEST, rule: 'bevel', faceted: false, normalScope: 'all', normalFromD0: false, fastShade: false };
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params: PARAMS }));
}
