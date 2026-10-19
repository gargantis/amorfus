// mf, soft natural-blend look: the mf-iso mesh and weights; the fragment
// adds a per-material value-noise "height" (amplitude 0.35, ~1.25-block
// features) before the argmax, for grass/dirt/stone/sand only — an
// aesthetic alternative, not a jaggedness fix (fragment-side, not hashed).
import { makeFast, makeSoftFragment } from '../work/mf/fast.mjs';
const add = makeFast({ sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 });
export const name = 'mf-soft';
export const describe = 'mf-iso mesh and weights; fragment adds per-material value-noise heights (amp 0.35, freq 0.8) for grass/dirt/stone/sand before the argmax — a natural, organic boundary look.';
export const apron = 10;
export function mesh(region, scene, core) {
  return add(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region);
}
export const fragment = makeSoftFragment({ amp: 0.35, freq: 0.8 });
