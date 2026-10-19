// Team gh — combination: gh-cc8b's contour crossings as the starting offsets
// d₀ for every edge touching an edited block, then the gs team's pipeline:
// context-aware D-3 caps (headroom ≤ 2, 1-wide gaps, tall-foot), R dilated
// by 1, windowed quadric fit (|Δc|² < 25) + 1 Jacobi step (gs-mls params,
// editMid off because the crossings replace midpoints). Mesher: a copy of the
// gs mesher with the crossT hook (work/gh/patch-gs.mjs → mesher-ghgs.mjs).
// Apron 16: crossings reach R + 1 = 9, the fit window 4 + normals/step 2.
import { contourCross6 } from '../work/gh/syn2.mjs';
import { meshRegion } from '../work/gh/mesher-ghgs.mjs';
import { CFG } from './gh-cc8b.mjs';
import * as gsMls from './gs-mls.mjs';
export const name = 'gh-ccmls';
export const describe = 'gh-cc8b crossings as d₀ + gs-mls (context caps, R dilated 1, windowed quadric fit r = 5, 1 Jacobi step); apron 16.';
export const apron = 16;
export const PARAMS = { ...gsMls.params, editMid: false };
export function mesh(region, scene, core) {
  const r = contourCross6(region, CFG);
  return core.decodeMesh(meshRegion({ ...region, crossT: r?.crossT, params: PARAMS }));
}
