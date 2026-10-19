import { contourCross2 } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const cc = (cfg, params) => (region, core) => {
  const r = contourCross2(region, cfg);
  const m = ghMesh({ ...region, crossT: r?.crossT, params });
  return core.decodeMesh(m);
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'hints-narrow', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: N })) },
  { label: 'cc-R8-k0', mesh: cc({ R: 8, dome: false }, { k: 0, ...N }) },
  { label: 'cc-R8-k2-a12', apron: 12, mesh: cc({ R: 8, dome: false }, { k: 2, ...N }) },
  { label: 'cc-R8-k2-a10-UNSAFE', apron: 10, mesh: cc({ R: 8, dome: false }, { k: 2, ...N }) },
  { label: 'cc-R8-k0-a9-UNSAFE', apron: 9, mesh: cc({ R: 8, dome: false }, { k: 0, ...N }) },
];
