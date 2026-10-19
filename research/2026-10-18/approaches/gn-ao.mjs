// gn-ao: the minimal fix — AO only. Production geometry and normals; AO from
// a 4-wide box at the vertex's actual position over the hint partial volume
// (occupancy where edited), production curve 1 − 1.2·max(0, F − ½).
import { meshRegion } from '../work/gn/mesher-gn.mjs';
export const name = 'gn-ao';
export const describe = 'AO only: 4-wide box at the actual vertex position over hint partial volume (occupancy where edited), production linear curve; production normals.';
export const PARAMS = { aoRule: 'smooth', aoKernel: 'box', pvRule: 'rho', fastShade: true }; // fast path: same bytes as the generic one
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params: PARAMS }));
}
