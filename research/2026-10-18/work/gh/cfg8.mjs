import { contourCrossN } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const ccn = (cfg, params) => (region, core) => {
  const r = contourCrossN(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, crossN: cfg.noN ? undefined : r?.crossN, params }));
};
const N = { clearance: 'narrow' };
export const configs = [
  { label: 'hints-narrow', mesh: (r, core) => core.decodeMesh(ghMesh({ ...r, params: N })) },
  { label: 'cc-mean', mesh: ccn({ R: 8, noN: true }, { k: 0, ...N }) },
  { label: 'cc-qef', mesh: ccn({ R: 8 }, { k: 0, ...N }) },
  { label: 'cc-qef-ovr', mesh: ccn({ R: 8, override: true }, { k: 0, ...N }) },
  { label: 'cc-qef-ovr-p16', mesh: ccn({ R: 8, override: true, pow: 16 }, { k: 0, ...N }) },
];
