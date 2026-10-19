import * as base from '../../../approaches/mv-fit.mjs';
export const name = 'mv-v1w7';
export const OPT = { ...base.OPT, W: 7 };
export const apron = 10;
export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  return base.annotate(m, region, OPT);
}
