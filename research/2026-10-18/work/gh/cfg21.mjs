import { contourCross5 } from './syn2.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
const cc = (cfg, params) => (region, core) => {
  const r = contourCross5(region, cfg);
  return core.decodeMesh(ghMesh({ ...region, crossT: r?.crossT, params }));
};
const N = { k: 0, clearance: 'narrow' };
export const configs = [
  { label: 'cc8', mesh: cc({}, N) },
  { label: 'mirror', mesh: cc({ mirror: true }, N) },
  { label: 'cliffH', mesh: cc({ cliffH: true }, N) },
  { label: 'cliffY', mesh: cc({ cliffY: true }, N) },
  { label: 'cliffHY+m', mesh: cc({ cliffH: true, cliffY: true, mirror: true }, N) },
  { label: 'cliffH+m', mesh: cc({ cliffH: true, mirror: true }, N) },
  { label: 'cliffAll', mesh: cc({ cliffAll: true }, N) },
];
