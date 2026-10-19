import { genAttrsG, makeGenFragment } from '../field.mjs';
export const name = 'gm-g07';
export const apron = 3;
export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  return region.gmS ? genAttrsG(m, region, { alpha: 0.7, sBits: 0, eBits: 0 }) : m;
}
export const fragment = makeGenFragment();
