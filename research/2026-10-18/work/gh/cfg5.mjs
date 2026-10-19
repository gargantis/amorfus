import { contourCross } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const cc = (cfg, params) => (region, core) => {
  const r = contourCross(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, params }));
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'hints-narrow', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: N })) },
  { label: 'cc-R8-k0', mesh: cc({ R: 8 }, { k: 0, ...N }) },
  { label: 'cc-R7-k1', mesh: cc({ R: 7 }, { k: 1, ...N }) },
  { label: 'cc-R6-k2', mesh: cc({ R: 6 }, { k: 2, ...N }) },
  { label: 'cc-R5-k3', mesh: cc({ R: 5 }, { k: 3, ...N }) },
  { label: 'cc-R6-k2-l1', mesh: cc({ R: 6 }, { k: 2, lambda: 1, ...N }) },
];
