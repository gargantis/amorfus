import { makeGM, makeGMFragment } from '../gm-core.mjs';
const pass = makeGM({ rule: 'none', alpha: 0 });
export const name = 'gm-xhint';
export const apron = 6;
export function mesh(region, scene, core) {
  return pass(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region);
}
export const fragment = makeGMFragment();
