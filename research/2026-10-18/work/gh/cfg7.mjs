import { contourCross, contourCrossN } from './syn.mjs';
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
  { label: 'cc-qef-mu.2', mesh: ccn({ R: 8 }, { k: 0, qefMu: 0.2, ...N }) },
  { label: 'cc-qef-noplat', mesh: ccn({ R: 8, plateauInformative: false }, { k: 0, ...N }) },
  { label: 'cc-qef-w2', mesh: ccn({ R: 8, w0: 2 }, { k: 0, ...N }) },
];
