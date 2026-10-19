import { contourCross } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const cc = (cfg, params) => (region, core) => {
  const r = contourCross(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, params }));
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'hints', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: {} })) },
  { label: 'hints-narrow', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: N })) },
  { label: 'cc-R8-k0-N', mesh: cc({ R: 8 }, { k: 0, ...N }) },
  { label: 'cc-R8-k6-N', mesh: cc({ R: 8 }, { ...N }) },
  { label: 'cc-R8-k0-D3', mesh: cc({ R: 8 }, { k: 0 }) },
  { label: 'cc-R8-w2-k0-N', mesh: cc({ R: 8, w0: 2 }, { k: 0, ...N }) },
];
