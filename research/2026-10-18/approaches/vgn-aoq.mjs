// vgn: gn-best's AO (box at the actual position, partial volume, quadratic
// onset) with PRODUCTION normals — isolates the AO half of gn-best.
import { meshRegion } from '../work/gn/mesher-gn.mjs';
import { PARAMS as BEST } from './gn-best.mjs';
export const name = 'vgn-aoq';
export const describe = 'gn-best AO (quadratic onset) + production area normals (no edit-zone ring).';
export const PARAMS = { ...BEST, normalRule: 'area' };
export function mesh(region, scene, core) { return core.decodeMesh(meshRegion({ ...region, params: PARAMS })); }
