// Small dense simplex: maximise c·x subject to A·x ≤ b, x ≥ 0, b ≥ 0 (so
// the origin is feasible). Dantzig pricing with lowest-index tie-breaks,
// a fixed iteration cap, and only + − × ÷ and comparisons, so the result
// is the same on every engine for the same input order.
export function simplexMax(m, n, A, b, c, maxIter = 200) {
  const W = n + m + 1;
  const T = new Float64Array((m + 1) * W);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) T[i * W + j] = A[i * n + j];
    T[i * W + n + i] = 1;
    T[i * W + W - 1] = b[i];
  }
  for (let j = 0; j < n; j++) T[m * W + j] = -c[j];
  const basis = new Int32Array(m);
  for (let i = 0; i < m; i++) basis[i] = n + i;
  const EPS = 1e-11;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    let e = -1, most = -EPS;
    for (let j = 0; j < n + m; j++) {
      const v = T[m * W + j];
      if (v < most) { most = v; e = j; }
    }
    if (e < 0) break;
    let l = -1, best = Infinity;
    for (let i = 0; i < m; i++) {
      const a = T[i * W + e];
      if (a > EPS) {
        const r = T[i * W + W - 1] / a;
        if (r < best) { best = r; l = i; }
      }
    }
    if (l < 0) return null; // unbounded
    const pv = T[l * W + e];
    for (let j = 0; j < W; j++) T[l * W + j] /= pv;
    for (let i = 0; i <= m; i++) {
      if (i === l) continue;
      const f = T[i * W + e];
      if (f !== 0) for (let j = 0; j < W; j++) T[i * W + j] -= f * T[l * W + j];
    }
    basis[l] = e;
  }
  const x = new Float64Array(n);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i * W + W - 1];
  return { x, value: T[m * W + W - 1], iter };
}

/**
 * Max-margin separating curve of curvature-limited circles in a local
 * frame: g(p) = κ/2·|p|² + (n0 + u·t0)·p + c, with g ≤ −t on the inside
 * points and g ≥ t on the outside points (p relative to the origin o).
 * n0 is the unit normal pointing to the outside, t0 the unit tangent.
 * Maximises t − λκ·|κ|. Returns { kappa, u, c, t } or null.
 */
export function arcLP(inPts, outPts, ox, oz, n0x, n0z, t0x, t0z, opt = {}) {
  const K = opt.K ?? 1.0; // |κ| ≤ K
  const U = opt.U ?? 1.0; // |u| ≤ U
  const Cb = opt.Cb ?? 3.0; // |c| ≤ Cb
  const Tm = opt.Tmax ?? 2.0; // t ≤ Tmax
  const lamK = opt.lamK ?? 0.0;
  const pts = [];
  for (let i = 0; i < inPts.length; i += 2) pts.push(inPts[i] - ox, inPts[i + 1] - oz, -1);
  for (let i = 0; i < outPts.length; i += 2) pts.push(outPts[i] - ox, outPts[i + 1] - oz, 1);
  const np = pts.length / 3;
  // variables (all ≥ 0): k+ k− u' c' t'   with κ = k+ − k−, u = u' − U,
  // c = c' − Cb, t = t' − T0
  let T0 = 0;
  for (let i = 0; i < np; i++) {
    const x = pts[i * 3], z = pts[i * 3 + 1];
    const r2 = x * x + z * z;
    const need = K * r2 / 2 + U * Math.abs(t0x * x + t0z * z) + Cb + Math.abs(n0x * x + n0z * z) + 1;
    if (need > T0) T0 = need;
  }
  const n = 5;
  const m = np + 4;
  const A = new Float64Array(m * n);
  const b = new Float64Array(m);
  for (let i = 0; i < np; i++) {
    const x = pts[i * 3], z = pts[i * 3 + 1], s = pts[i * 3 + 2];
    const h = (x * x + z * z) / 2, tp = t0x * x + t0z * z, np0 = n0x * x + n0z * z;
    // inside (s = −1): g + t ≤ 0 ; outside (s = +1): −g + t ≤ 0
    // −s·g + t ≤ 0 with g = (k+ − k−)h + np0 + (u' − U)tp + (c' − Cb)
    A[i * n + 0] = -s * h;
    A[i * n + 1] = s * h;
    A[i * n + 2] = -s * tp;
    A[i * n + 3] = -s;
    A[i * n + 4] = 1;
    b[i] = s * np0 - s * U * tp - s * Cb + T0;
  }
  // bounds
  A[np * n + 0] = 1; b[np] = K;
  A[(np + 1) * n + 1] = 1; b[np + 1] = K;
  A[(np + 2) * n + 2] = 1; b[np + 2] = 2 * U;
  A[(np + 3) * n + 3] = 1; b[np + 3] = 2 * Cb;
  // t' ≤ T0 + Tm is implied by maximisation within the other bounds only if
  // bounded; add it explicitly by folding into the objective cap below.
  const A2 = new Float64Array((m + 1) * n);
  A2.set(A);
  A2[m * n + 4] = 1;
  const b2 = new Float64Array(m + 1);
  b2.set(b);
  b2[m] = T0 + Tm;
  for (let i = 0; i < m + 1; i++) if (b2[i] < 0) return null; // origin infeasible (should not happen)
  const cObj = [-lamK, -lamK, 0, 0, 1];
  const r = simplexMax(m + 1, n, A2, b2, cObj);
  if (!r) return null;
  const kappa = r.x[0] - r.x[1];
  return { kappa, u: r.x[2] - U, c: r.x[3] - Cb, t: r.x[4] - T0 };
}

/**
 * Analytic centre of the consistent arcs: maximise Σ log(slack) over
 * (κ, u, c) subject to the same pixel constraints as arcLP (with margin
 * m0, possibly negative to relax an inconsistent window) and |κ| ≤ K,
 * starting from a strictly feasible point. Fixed iteration count; only
 * + − × ÷ √ and comparisons.
 */
export function arcCenter(inPts, outPts, ox, oz, n0x, n0z, t0x, t0z, x0, m0, K, iters = 16) {
  const rows = []; // a·x ≤ b with x = (κ, u, c)
  const add = (a0, a1, a2, b) => rows.push(a0, a1, a2, b);
  for (let i = 0; i < inPts.length; i += 2) {
    const x = inPts[i] - ox, z = inPts[i + 1] - oz;
    const h = (x * x + z * z) / 2, tp = t0x * x + t0z * z, np0 = n0x * x + n0z * z;
    add(h, tp, 1, -np0 - m0); // g ≤ −m0
  }
  for (let i = 0; i < outPts.length; i += 2) {
    const x = outPts[i] - ox, z = outPts[i + 1] - oz;
    const h = (x * x + z * z) / 2, tp = t0x * x + t0z * z, np0 = n0x * x + n0z * z;
    add(-h, -tp, -1, np0 - m0); // −g ≤ −m0
  }
  add(1, 0, 0, K);
  add(-1, 0, 0, K);
  const m = rows.length / 4;
  let k = x0[0], u = x0[1], c = x0[2];
  for (let it = 0; it < iters; it++) {
    let g0 = 0, g1 = 0, g2 = 0;
    let h00 = 0, h01 = 0, h02 = 0, h11 = 0, h12 = 0, h22 = 0;
    let bad = false;
    for (let r = 0; r < m; r++) {
      const a0 = rows[r * 4], a1 = rows[r * 4 + 1], a2 = rows[r * 4 + 2], b = rows[r * 4 + 3];
      const sl = b - (a0 * k + a1 * u + a2 * c);
      if (!(sl > 0)) { bad = true; break; }
      const w = 1 / sl, w2 = w * w;
      g0 += a0 * w; g1 += a1 * w; g2 += a2 * w;
      h00 += a0 * a0 * w2; h01 += a0 * a1 * w2; h02 += a0 * a2 * w2;
      h11 += a1 * a1 * w2; h12 += a1 * a2 * w2; h22 += a2 * a2 * w2;
    }
    if (bad) break;
    // Δ = −H⁻¹ g (ascent direction of Σ log slack)
    const det = h00 * (h11 * h22 - h12 * h12) - h01 * (h01 * h22 - h12 * h02) + h02 * (h01 * h12 - h11 * h02);
    if (!(det > 1e-30)) break;
    const i00 = (h11 * h22 - h12 * h12) / det, i01 = (h02 * h12 - h01 * h22) / det, i02 = (h01 * h12 - h02 * h11) / det;
    const i11 = (h00 * h22 - h02 * h02) / det, i12 = (h01 * h02 - h00 * h12) / det, i22 = (h00 * h11 - h01 * h01) / det;
    const d0 = -(i00 * g0 + i01 * g1 + i02 * g2);
    const d1 = -(i01 * g0 + i11 * g1 + i12 * g2);
    const d2 = -(i02 * g0 + i12 * g1 + i22 * g2);
    // largest step keeping every slack positive, damped
    let amax = 1;
    for (let r = 0; r < m; r++) {
      const a0 = rows[r * 4], a1 = rows[r * 4 + 1], a2 = rows[r * 4 + 2], b = rows[r * 4 + 3];
      const ad = a0 * d0 + a1 * d1 + a2 * d2;
      if (ad > 0) {
        const sl = b - (a0 * k + a1 * u + a2 * c);
        const lim = (0.9 * sl) / ad;
        if (lim < amax) amax = lim;
      }
    }
    k += amax * d0; u += amax * d1; c += amax * d2;
  }
  return [k, u, c];
}
