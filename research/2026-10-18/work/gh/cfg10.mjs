import { contourCrossN } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const ccn = (cfg, params) => (region, core) => {
  const r = contourCrossN(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, crossN: cfg.qef ? r?.crossN : undefined, params }));
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'hints', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: {} })) },
  { label: 'hints-narrow', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: N })) },
  { label: 'cc-R8-k0', mesh: ccn({ R: 8 }, { k: 0, ...N }) },
  { label: 'cc-R4-k4-flat', mesh: ccn({ R: 4, w0: 0.01 }, { k: 4, ...N }) },
];
