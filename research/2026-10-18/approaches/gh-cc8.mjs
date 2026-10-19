// Team gh — synthetic crossings by contour interpolation (geometry only).
// Every sign-changing edge that touches a shape-edited block gets its
// crossing from the block data: in the plane ⊥ the edge, the nearest air
// block sitting on a same-facing face (down-contour) and the nearest solid
// block under a same-facing face (up-contour), searched to R = 8; the
// crossing interpolates linearly between them, so every crossing of a 1:k or
// k:1 staircase (k ≤ 8) lies on the plane through its riser midpoints. A
// one-sided contour (plateau edge) rounds over w0 = 1; none → the face.
// Generated/generated edges keep their generator hints. No relaxation
// (k = 0); D-3 caps only at narrow openings. Apron: R + 2 = 10.
import { contourCross4 } from '../work/gh/syn.mjs';
import { meshRegion } from '../work/gh/mesher-gh.mjs';
export const name = 'gh-cc8';
export const describe = 'Contour-interpolated crossings for every edge touching an edited block (R = 8, plateau w0 = 1), k = 0, narrow-opening D-3 caps; corner AO.';
export const apron = 10;
export function mesh(region, scene, core) {
  const r = contourCross4(region, { R: 8, w0: 1 });
  return core.decodeMesh(meshRegion({ ...region, crossT: r?.crossT, params: { k: 0, clearance: 'narrow' } }));
}
