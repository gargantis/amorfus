import { contourCross2 } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const cc = (cfg, params) => (region, core) => {
  const r = contourCross2(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, params }));
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'hints-narrow', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: N })) },
  { label: 'cc-R8-k0', mesh: cc({ R: 8, dome: false }, { k: 0, ...N }) },
  { label: 'ccd-R8-k0', mesh: cc({ R: 8 }, { k: 0, ...N }) },
  { label: 'ccd-R6-k2', mesh: cc({ R: 6 }, { k: 2, ...N }) },
  { label: 'ccd-R4-k4', mesh: cc({ R: 4 }, { k: 4, ...N }) },
];
