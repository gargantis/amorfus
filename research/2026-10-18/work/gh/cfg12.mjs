import { contourCross2 } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const cc = (cfg, params) => (region, core) => {
  const r = contourCross2(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, params }));
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'hints', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: {} })) },
  { label: 'hints-narrow', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: N })) },
  { label: 'cc-R8-k0', mesh: cc({ R: 8, dome: false }, { k: 0, ...N }) },
  { label: 'cc-R8-k6-a16', apron: 16, mesh: cc({ R: 8, dome: false }, { ...N }) },
  { label: 'cc-R8-k6-flat-a16', apron: 16, mesh: cc({ R: 8, dome: false, w0: 0.01 }, { ...N }) },
];
