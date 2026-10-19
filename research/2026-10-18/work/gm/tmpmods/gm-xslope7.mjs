import { makeGM, makeGMFragment } from '../gm-core.mjs';
const pass = makeGM({ rule: 'slope', alpha: 0.7 });
export const name = 'gm-xslope7';
export const apron = 6;
export function mesh(region, scene, core) {
  return pass(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region);
}
export const fragment = makeGMFragment();
