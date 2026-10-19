// Team gh — gh-cc8-ao plus k = 2 damped Jacobi over the edited set (rounds
// domes and outlines a little). Seam-safe only with apron ≥ R + k + 2 = 12
// (measured: apron 10 gives 30 mismatching shared vertices of 4955).
import { contourCross4 } from '../work/gh/syn.mjs';
import { meshRegion } from '../work/gh/mesher-gh.mjs';
export const name = 'gh-cc8k2-ao';
export const describe = 'gh-cc8-ao + k = 2 relaxation; needs apron 12 (56³ region for edited chunks).';
export const apron = 12;
export function mesh(region, scene, core) {
  const r = contourCross4(region, { R: 8, w0: 1 });
  return core.decodeMesh(meshRegion({ ...region, crossT: r?.crossT, params: { k: 2, clearance: 'narrow', aoMode: 'position' } }));
}
