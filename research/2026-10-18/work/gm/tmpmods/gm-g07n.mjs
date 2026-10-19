import { genAttrsG, makeGenFragmentNoise } from '../field.mjs';
export const name = 'gm-g07n';
export const apron = 3;
export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  return region.gmS ? genAttrsG(m, region, { alpha: 0.7, sBits: 0, eBits: 0 }) : m;
}
export const fragment = makeGenFragmentNoise({ beta: 0.25, freq: 0.25 });
