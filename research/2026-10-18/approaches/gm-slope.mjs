// gm look option: generator material hints + a SLOPE EXPOSURE rule.
// As gm-hint, but E = 0.7·σ + max(0, D − 0.3) with σ = |∇D| / |∂D/∂y| (1/cos
// of the generator surface's slope, central differences of the 1/16 Int8 D
// plane, trilinear; a 1/256 Int16 plane measured no better): dirt where the generated surface is steeper than ~44°
// (1/cosθ > 1/0.7), stone above ~80° (σ > 5.7), plus the depth layers in
// caves and digs. Smooth exposure patches instead of the dithered stripes.
// The slope term fades out over ±1.5 blocks around the shore (sand keeps
// its top; without the fade steep beach banks turned dirt).
// Same planes as gm-hint (Int16 S per column, Int8 D per block). Edited zones: mf-iso with the gen field as background, ramps
// scaled by the local |∇E|.
import { makeGM, makeGMFragment } from '../work/gm/gm-core.mjs';
import { attachGenPlanes } from '../work/gm/shim.mjs';
const pass = makeGM({ rule: 'slope', alpha: 0.7, fine: false, sandFade: 1.5 });
export const name = 'gm-slope';
export const describe = "Generator material hints + slope exposures: E = 0.7·|∇D|/|D_y|·(shore fade) + max(0, D−0.3) from the Int8 D plane; 2×12-bit vertex codes; mf-iso fallback near edits; geometry = 'hints'.";
export const apron = 6;
export function mesh(region, scene, core) {
  const r = attachGenPlanes(region);
  return pass(core.decodeMesh(core.meshRegion({ ...r, params: {} })), r);
}
export const fragment = makeGMFragment();
