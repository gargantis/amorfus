// mf: per-vertex material field (the recommended variant).
// Gaussian σ 1.2 over surface blocks in 3-D (window ±2.5 blocks), self-
// support guard τ 0.55 (a block whose own material holds < 55 % of the
// kernel at its own centre is weighted up to 55 %), 'auto' quads (flip a
// boundary quad's diagonal toward the face-centre field where the twist is
// ≤ 0.03; fan around the kept diagonal's midpoint where it would show the
// wrong winner), 6 × 5-bit signed weights relative to the quad's own
// material (R = 0.5). Geometry = production 'hints'. Needs apron 6.
import { makeFast, fragmentArgmax } from '../work/mf/fast.mjs';
const add = makeFast({ sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 });
export const name = 'mf-iso';
export const describe = "Material field: Gaussian σ 1.2 over surface blocks (±2.5), self-support guard τ 0.55, auto flips/fans on boundary quads, 6×5-bit weights; geometry = 'hints'; apron 6.";
export const apron = 6; // verified: per-vertex fields identical to apron 10 on 16 terrain chunks; apron 5 differs
export function mesh(region, scene, core) {
  return add(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region);
}
export const fragment = fragmentArgmax;
