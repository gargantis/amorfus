// mf predecessor of mf-iso: same field (Gaussian σ 1.2, self-support τ 0.55,
// float weights) but diagonal FLIPS only (twist ≤ 0.03), no fans — shows
// what fans add (lone blocks, curved terrain where flips are blocked).
import { build } from '../work/mf/field.mjs';
const A = build({
  name: 'mf-flip',
  describe: "Material field, Gaussian σ 1.2, self-support τ 0.55, diagonal flips only (twist ≤ 0.03), float weights; geometry = 'hints'.",
  kernel: { type: 'gauss', sigma: 1.2, trunc: 2.5 },
  guard: { type: 'support', tau: 0.55 },
  bits: null,
  diag: 'flip',
});
export const name = A.name, describe = A.describe, apron = A.apron;
export const mesh = A.mesh, fragment = A.fragment;
