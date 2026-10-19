import { genAttrsAll, makeGenFragment } from '../field.mjs';
export const name = 'gm-a0';
export const apron = 3;
export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  return region.gmS ? genAttrsAll(m, region, { alpha: 0, sBits: 0, eBits: 0 }) : m;
}
export const fragment = makeGenFragment();
