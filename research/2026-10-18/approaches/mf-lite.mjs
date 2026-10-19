// mf, light variant: Gaussian σ 0.9 over surface blocks with a short
// window (±1.5 blocks), self-support guard τ 0.60, auto flips/fans,
// 6 × 5-bit weights. Needs apron 4 (40³ region) and half the field cost of
// mf-iso; better thin lines and squarer corners, more ripple on shallow
// edges and big curves.
import { makeFast, fragmentArgmax } from '../work/mf/fast.mjs';
const add = makeFast({ sigma: 0.9, trunc: 1.5, tau: 0.6, bits: 5, R: 0.5, flipTwist: 0.03 });
export const name = 'mf-lite';
export const describe = "Material field, light: Gaussian σ 0.9 (±1.5 window), self-support τ 0.60, auto flips/fans, 6×5-bit weights; geometry = 'hints'; apron 4.";
export const apron = 4; // verified: fields identical to apron 10 on 16 terrain chunks; apron 3 differs
export function mesh(region, scene, core) {
  return add(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region);
}
export const fragment = fragmentArgmax;
