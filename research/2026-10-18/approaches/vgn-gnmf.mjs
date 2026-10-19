// vgn: gn-best shading (AO + edit-zone normals) with mf-iso's material
// field on top (same makeFast options as approaches/mf-iso.mjs). mf-iso
// post-processes the decoded mesh, so it runs unchanged on gn-best's mesh.
// Apron 10 (gn's edited apron; mf needs 6).
import { makeFast, fragmentArgmax } from '../work/mf/fast.mjs';
import { meshRegion as gnMesh } from '../work/gn/mesher-gn.mjs';
import { PARAMS } from './gn-best.mjs';
const add = makeFast({ sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 });
export const name = 'vgn-gnmf';
export const describe = 'gn-best shading + mf-iso material field (review combination).';
export const apron = 10;
export function mesh(region, scene, core) {
  return add(core.decodeMesh(gnMesh({ ...region, params: PARAMS })), region);
}
export const fragment = fragmentArgmax;
