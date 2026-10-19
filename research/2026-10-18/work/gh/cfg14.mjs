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
  { label: 'cc-R6-k2', mesh: cc({ R: 6, dome: false }, { k: 2, ...N }) },
  { label: 'cc-R8-k2-a12', apron: 12, mesh: cc({ R: 8, dome: false }, { k: 2, ...N }) },
  { label: 'cc-R8-k3-a13', apron: 13, mesh: cc({ R: 8, dome: false }, { k: 3, ...N }) },
  { label: 'cc-R7-k3-a12', apron: 12, mesh: cc({ R: 7, dome: false }, { k: 3, ...N }) },
];
