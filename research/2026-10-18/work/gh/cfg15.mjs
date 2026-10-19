import { contourCross2 } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const cc = (cfg, params) => (region, core) => {
  const r = contourCross2(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, params }));
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'hints', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: {} })) },
  { label: 'hints-aopos', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: { aoMode: 'position' } })) },
  { label: 'cc-R8-k0', mesh: cc({ R: 8, dome: false }, { k: 0, ...N }) },
  { label: 'cc-R8-k0-aopos', mesh: cc({ R: 8, dome: false }, { k: 0, aoMode: 'position', ...N }) },
  { label: 'cc-R8-k2-a12-aopos', apron: 12, mesh: cc({ R: 8, dome: false }, { k: 2, aoMode: 'position', ...N }) },
];
