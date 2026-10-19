// Team gh, round 2 — synthetic crossings by contour interpolation, repaired.
// Every sign-changing edge that touches a shape-edited block gets its
// crossing from the block data (work/gh/syn2.mjs contourCross6, output ≡ the
// plain reference contourCross5 on 116 crossing sets): in the
// plane ⊥ the edge, A = the nearest point one level lower (an air block with
// solid behind it, or — cliffs — any air block: in the edge's own layer for
// horizontal edges, anywhere in the plane for vertical edges) and S = the
// nearest point one level higher (mirror image); the crossing interpolates
// linearly between them (t = eA/(eA+eS), e = d − ½), so every crossing of a
// 1:k or k:1 staircase (k ≤ 8) lies on the plane through its riser
// midpoints. One-sided: look along the mirror image of the found direction
// for the missing type (repairs the toe of 1:1 stairs); else a plateau edge
// rounds over w0 = 1. Generated/generated edges keep their hints. No
// relaxation (k = 0); D-3 caps only at narrow openings (x/z air run 1, y air
// run ≤ 2). Apron: R + 2 = 10.
import { contourCross6 } from '../work/gh/syn2.mjs';
import { meshRegion } from '../work/gh/mesher-gh.mjs';
export const name = 'gh-cc8b';
export const describe = 'Contour-interpolated crossings for edges touching edited blocks (R = 8, cliff-aware, mirror toe repair, plateau w0 = 1), k = 0, narrow-opening D-3 caps; production AO.';
export const apron = 10;
export const CFG = { R: 8, w0: 1, cliffH: true, cliffY: true, mirror: true };
export const PARAMS = { k: 0, clearance: 'narrow' };
export function mesh(region, scene, core) {
  const r = contourCross6(region, CFG);
  return core.decodeMesh(meshRegion({ ...region, crossT: r?.crossT, params: PARAMS }));
}
