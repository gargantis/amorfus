// mf: per-vertex material field with an anisotropic kernel over surface
// blocks — narrow across the material boundary (Ln 1.8), long along it
// (up to 5), direction from the covariance of nearby boundary pairs;
// self-support guard τ 0.55; 'auto' diagonals (value-error flips where the
// twist ≤ 0.03, fans where the kept diagonal shows the wrong winner).
import { build } from '../work/mf/field.mjs';
const A = build({
  name: 'mf-aniso',
  describe: "Material field, anisotropic kernel (across Ln 1.8, along ≤ 5, direction from boundary-pair covariance r 3), self-support guard τ 0.55, auto diagonals/fans, float weights; geometry = 'hints'.",
  kernel: { type: 'aniso', ln: 1.8, llong: 5, dirR: 3 },
  guard: { type: 'support', tau: 0.55 },
  bits: null,
  diag: 'auto',
});
export const name = A.name, describe = A.describe, apron = A.apron;
export const mesh = A.mesh, fragment = A.fragment;
