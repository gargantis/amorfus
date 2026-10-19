// stack — gm's generator material fields per vertex (GEN mode), copied from
// work/gm/gm-core.mjs (gen(), encS, encE, the slope term and shore fade)
// with the same float operations in the same order, so the stored codes are
// bit-identical to gm-hint / gm-slope (verified: work/stack/check-gen.mjs).
//
//   S = SEA+2 − H         per column (plane gmS, Int16 at 1/256), bilinear
//   E = α·σ(p)·fade + max(0, D(p) − δ)   D = dTerrain (plane gmD, Int8 at 1/16), trilinear
// rule 'none' (gm-hint): α = 0, δ = 0          — the literal v1 rule
// rule 'slope' (gm-slope): α = 0.7, δ = 0.3, σ = |∇D|/|∂D/∂y| (cap 8),
//                          shore fade over ±1.5 blocks
// Stored as two 12-bit codes: S over ±8 H-units, E over [−1, 7).
// Fragment: E ≤ 1 → (S ≥ 0 ? sand : grass); E ≤ 4 → dirt; else stone.
import { biS, gradS, triP } from '../gm/field.mjs';

export const GRASS = 1, DIRT = 2, STONE = 3, SAND = 4;
export const RULES = {
  none: { rule: 'none', alpha: 0, delta: 0, sandFade: 0 },
  slope: { rule: 'slope', alpha: 0.7, delta: 0.3, sandFade: 1.5 },
};

export function makeEncoders({ sBits = 12, eBits = 12, sMax = 8, eLo = -1, eHi = 7 } = {}) {
  const sq = sBits ? (1 << (sBits - 1)) - 1 : 0, eq = eBits ? (1 << eBits) - 1 : 0;
  const encS = (v) => { const c = v < -sMax ? -sMax : v > sMax ? sMax : v; return sq ? (Math.round((c / sMax) * sq) / sq) * sMax : c; };
  const encE = (v) => { const c = v < eLo ? eLo : v > eHi ? eHi : v; return eq ? eLo + (Math.round(((c - eLo) / (eHi - eLo)) * eq) / eq) * (eHi - eLo) : c; };
  // integer codes as they would sit in bytes 13–15 (12 + 12 bits)
  const codeS = (v) => { const c = v < -sMax ? -sMax : v > sMax ? sMax : v; return Math.round((c / sMax) * sq); };
  const codeE = (v) => { const c = v < eLo ? eLo : v > eHi ? eHi : v; return Math.round(((c - eLo) / (eHi - eLo)) * eq); };
  return { encS, encE, codeS, codeE };
}

/** The v1 material rule on interpolated (s, e) — the GEN fragment path. */
export function genRule(s, e, t1 = 1, t2 = 4) {
  if (e <= t1) return s >= 0 ? SAND : GRASS;
  if (e <= t2) return DIRT;
  return STONE;
}

/** Per-region gen field evaluator: gen(x, y, z, out) at REGION coordinates
 *  fills out[0] = S, out[1] = E (unquantised). Requires region.gmS/gmD. */
export function makeGenField(region, ruleName = 'none') {
  const R = RULES[ruleName];
  if (!R) throw new Error(`unknown gen rule ${ruleName}`);
  const { nx, ny, nz, gmS } = region;
  const P = region.gmD, PS = 16; // gm: fine = false for both rules (Int8 plane)
  const N = nx * ny * nz, SY = nx * nz, SZ = nx;
  const alpha = R.alpha, delta = R.delta, sandFade = R.sandFade;
  let sigAt = null;
  if (R.rule !== 'none' && alpha !== 0) {
    const G = new Float64Array(N).fill(-1);
    const cap = 8;
    const at = (i) => {
      let g = G[i];
      if (g >= 0) return g;
      const x = i % nx, z = Math.floor(i / nx) % nz, y = Math.floor(i / SY);
      const gx = x > 0 && x < nx - 1 ? (P[i + 1] - P[i - 1]) / (2 * PS) : 0;
      const gy = y > 0 && y < ny - 1 ? (P[i + SY] - P[i - SY]) / (2 * PS) : 0;
      const gz = z > 0 && z < nz - 1 ? (P[i + SZ] - P[i - SZ]) / (2 * PS) : 0;
      g = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (R.rule === 'slope') { const ay = gy < 0 ? -gy : gy; g = ay * cap > g ? g / ay : cap; }
      G[i] = g;
      return g;
    };
    sigAt = (x, y, z) => {
      const qx = x - 0.5, qy = y - 0.5, qz = z - 0.5;
      const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz);
      const tx = qx - ix, ty = qy - iy, tz = qz - iz, b = (iy * nz + iz) * nx + ix;
      const c000 = at(b), c100 = at(b + 1), c010 = at(b + SY), c110 = at(b + SY + 1);
      const c001 = at(b + SZ), c101 = at(b + SZ + 1), c011 = at(b + SY + SZ), c111 = at(b + SY + SZ + 1);
      const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx, x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
      const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
      return y0 + (y1 - y0) * tz;
    };
  }
  const expoW = (x, z) => {
    if (!sandFade) return 1;
    const S = biS(gmS, nx, nz, x, z), g = gradS(gmS, nx, nz, x, z);
    const sd = S / (g > 0.02 ? g : 0.02);
    const w = 0.5 - sd / (2 * sandFade);
    return w < 0 ? 0 : w > 1 ? 1 : w;
  };
  return function gen(x, y, z, out) {
    out[0] = biS(gmS, nx, nz, x, z);
    const Dv = triP(P, PS, nx, ny, nz, x, y, z);
    out[1] = (sigAt ? alpha * sigAt(x, y, z) * expoW(x, z) : 0) + (Dv > delta ? Dv - delta : 0);
    return out;
  };
}
