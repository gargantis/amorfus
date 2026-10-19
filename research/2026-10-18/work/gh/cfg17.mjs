import { contourCross2 } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const cc = (cfg, params) => (region, core) => {
  const r = contourCross2(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, params }));
};
const N = { clearance: 'narrow', aoMode: 'position' };
export const configs = [
  { label: 'hints-narrow-ao', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: N })) },
  { label: 'cc-R8-k0', mesh: cc({ R: 8, dome: false }, { k: 0, ...N }) },
  { label: 'ccYb-R8-k0', mesh: cc({ R: 8, dome: false, axes: [1], binaryOther: true }, { k: 0, ...N }) },
  { label: 'ccYb-R6-k2', mesh: cc({ R: 6, dome: false, axes: [1], binaryOther: true }, { k: 2, ...N }) },
  { label: 'ccYb-R8-k2-a12', apron: 12, mesh: cc({ R: 8, dome: false, axes: [1], binaryOther: true }, { k: 2, ...N }) },
  { label: 'ccYb-R8-k6-a16', apron: 16, mesh: cc({ R: 8, dome: false, axes: [1], binaryOther: true }, { k: 6, ...N }) },
  { label: 'hb-k6', mesh: cc({ R: 8, dome: false, axes: [], binaryOther: true }, { ...N }) },
];
