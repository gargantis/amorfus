// Max-margin arc LP by a primal vertex-walking simplex in 4 variables
// x = (κ, u, c, t): maximise t subject to
//   inside  p:  h κ + tp u + c + t ≤ −np
//   outside p: −h κ − tp u − c + t ≤  np
//   |κ| ≤ K, |u| ≤ U, |c| ≤ Cb, t ≤ Tmax
// (h = |p|²/2, tp = t0·p, np = n0·p, p relative to o). Bland's rule (lowest
// index) for leaving and entering rows: deterministic, no cycling; only
// + − × ÷ and comparisons.
const EPS = 1e-12;
const rowsBuf = { A: new Float64Array(0), b: new Float64Array(0) };
function ensure(m) {
  if (rowsBuf.A.length < m * 4) { rowsBuf.A = new Float64Array(m * 8); rowsBuf.b = new Float64Array(m * 2); }
}
/** Invert the 4×4 matrix M (row-major) into Inv; returns false if singular. */
const SCR = new Float64Array(32);
function inv4(M, Inv) {
  const a = SCR;
  for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) { a[i * 8 + j] = M[i * 4 + j]; a[i * 8 + 4 + j] = i === j ? 1 : 0; } }
  for (let c = 0; c < 4; c++) {
    let p = c, best = Math.abs(a[c * 8 + c]);
    for (let r = c + 1; r < 4; r++) { const v = Math.abs(a[r * 8 + c]); if (v > best) { best = v; p = r; } }
    if (best < 1e-14) return false;
    if (p !== c) for (let j = 0; j < 8; j++) { const t = a[c * 8 + j]; a[c * 8 + j] = a[p * 8 + j]; a[p * 8 + j] = t; }
    const pv = a[c * 8 + c];
    for (let j = 0; j < 8; j++) a[c * 8 + j] /= pv;
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = a[r * 8 + c];
      if (f !== 0) for (let j = 0; j < 8; j++) a[r * 8 + j] -= f * a[c * 8 + j];
    }
  }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) Inv[i * 4 + j] = a[i * 8 + 4 + j];
  return true;
}
const MB = new Float64Array(16), IB = new Float64Array(16);
export function arcLP4(inPts, outPts, ox, oz, n0x, n0z, t0x, t0z, opt = {}) {
  const K = opt.K ?? 1.0, U = opt.U ?? 1.0, Cb = opt.Cb ?? 3.0, Tm = opt.Tmax ?? 2.0;
  const np = (inPts.length + outPts.length) / 2;
  const m = np + 7;
  ensure(m);
  const A = rowsBuf.A, b = rowsBuf.b;
  let r = 0;
  for (let i = 0; i < inPts.length; i += 2, r++) {
    const x = inPts[i] - ox, z = inPts[i + 1] - oz;
    A[r * 4] = (x * x + z * z) / 2; A[r * 4 + 1] = t0x * x + t0z * z; A[r * 4 + 2] = 1; A[r * 4 + 3] = 1;
    b[r] = -(n0x * x + n0z * z);
  }
  for (let i = 0; i < outPts.length; i += 2, r++) {
    const x = outPts[i] - ox, z = outPts[i + 1] - oz;
    A[r * 4] = -(x * x + z * z) / 2; A[r * 4 + 1] = -(t0x * x + t0z * z); A[r * 4 + 2] = -1; A[r * 4 + 3] = 1;
    b[r] = n0x * x + n0z * z;
  }
  // bounds: rows np..np+6
  const setRow = (k, a0, a1, a2, a3, bb) => { A[k * 4] = a0; A[k * 4 + 1] = a1; A[k * 4 + 2] = a2; A[k * 4 + 3] = a3; b[k] = bb; };
  setRow(np, 1, 0, 0, 0, K); setRow(np + 1, -1, 0, 0, 0, K);
  setRow(np + 2, 0, 1, 0, 0, U); setRow(np + 3, 0, -1, 0, 0, U);
  setRow(np + 4, 0, 0, 1, 0, Cb); setRow(np + 5, 0, 0, -1, 0, Cb);
  setRow(np + 6, 0, 0, 0, 1, Tm);
  // initial vertex: κ = −K, u = −U, c = −Cb, t = the binding point row (or Tmax)
  let x0 = -K, x1 = -U, x2 = -Cb, x3 = Tm, tRow = np + 6;
  for (let i = 0; i < np; i++) {
    const v = b[i] - (A[i * 4] * x0 + A[i * 4 + 1] * x1 + A[i * 4 + 2] * x2);
    if (v < x3) { x3 = v; tRow = i; }
  }
  const B = [np + 1, np + 3, np + 5, tRow];
  const x = [x0, x1, x2, x3];
  let iter = 0;
  for (; iter < 200; iter++) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) MB[i * 4 + j] = A[B[i] * 4 + j];
    if (!inv4(MB, IB)) return null;
    // y = A_B^{-T} c, c = (0,0,0,1): y_i = IB[3][i]
    let leave = -1, leaveRow = Infinity;
    for (let i = 0; i < 4; i++) { if (IB[3 * 4 + i] < -EPS && B[i] < leaveRow) { leaveRow = B[i]; leave = i; } }
    if (leave < 0) break; // optimal
    // direction d = −A_B^{-1} e_leave (column `leave` of IB, negated)
    const d0 = -IB[0 * 4 + leave], d1 = -IB[1 * 4 + leave], d2 = -IB[2 * 4 + leave], d3 = -IB[3 * 4 + leave];
    let step = Infinity, enter = -1;
    for (let i = 0; i < m; i++) {
      if (i === B[0] || i === B[1] || i === B[2] || i === B[3]) continue;
      const ad = A[i * 4] * d0 + A[i * 4 + 1] * d1 + A[i * 4 + 2] * d2 + A[i * 4 + 3] * d3;
      if (ad > EPS) {
        let sl = b[i] - (A[i * 4] * x[0] + A[i * 4 + 1] * x[1] + A[i * 4 + 2] * x[2] + A[i * 4 + 3] * x[3]);
        if (sl < 0) sl = 0;
        const s = sl / ad;
        if (s < step - 1e-15) { step = s; enter = i; }
      }
    }
    if (enter < 0) return null; // unbounded (cannot happen with the bounds)
    x[0] += step * d0; x[1] += step * d1; x[2] += step * d2; x[3] += step * d3;
    B[leave] = enter;
  }
  STATS.iters += iter; STATS.calls++;
  return { kappa: x[0], u: x[1], c: x[2], t: x[3] };
}
export const STATS = { iters: 0, calls: 0 };
