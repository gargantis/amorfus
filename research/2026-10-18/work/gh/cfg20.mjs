import { contourCross2, contourCross4 } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const cc = (fn, cfg, params) => (region, core) => {
  const r = fn(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, params }));
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'cc8', mesh: cc(contourCross4, { R: 8, w0: 1 }, { k: 0, ...N }) },
  { label: 'cc8-dome', mesh: cc(contourCross2, { R: 8, w0: 1, dome: true }, { k: 0, ...N }) },
  { label: 'cc8-w0.5', mesh: cc(contourCross4, { R: 8, w0: 0.5 }, { k: 0, ...N }) },
  { label: 'cc8-w2', mesh: cc(contourCross4, { R: 8, w0: 2 }, { k: 0, ...N }) },
  { label: 'cc8-dome-w2', mesh: cc(contourCross2, { R: 8, w0: 2, dome: true }, { k: 0, ...N }) },
];
