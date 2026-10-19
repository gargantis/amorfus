// Team gh — combination: gh-cc8b's contour crossings as d₀, then the gs-ctx
// pipeline (context-aware D-3 caps, R dilated by 1, §7.3 k = 6 Jacobi).
// Apron 16 (crossing reach 9 + k + 1).
import { contourCross6 } from '../work/gh/syn2.mjs';
import { meshRegion } from '../work/gh/mesher-ghgs.mjs';
import { CFG } from './gh-cc8b.mjs';
export const name = 'gh-ccj6';
export const describe = 'gh-cc8b crossings as d₀ + gs-ctx (context caps, R dilated 1, k = 6 Jacobi); apron 16.';
export const apron = 16;
export const PARAMS = { capMode: 'context', rDilate: 1 };
export function mesh(region, scene, core) {
  const r = contourCross6(region, CFG);
  return core.decodeMesh(meshRegion({ ...region, crossT: r?.crossT, params: PARAMS }));
}
