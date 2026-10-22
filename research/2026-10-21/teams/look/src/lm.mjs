// Team "look" measurements on a finished sim (block coordinates, y up).
// Two surfaces are measured, and every number says which:
//   "lab" — the final labels (the physics), read through a trilinear
//           interpolation of the solid indicator (surface at 0.5); error
//           about half a sub-cell (1/32 block at n = 16).
//   "D"   — the render field sim.D (re-blurred, volume-corrected), what the
//           pictures show; it rounds sharp creases by ~0.1 block (README).
import { sampleGrid } from '../../../lib/mbo.mjs';

export function fields(sim) {
  const I = new Float32Array(sim.N);
  for (let c = 0; c < sim.N; c++) I[c] = sim.label[c] ? 1 : 0;
  return {
    lab: (x, y, z) => sampleGrid(sim, I, x, y, z) - 0.5,
    D: (x, y, z) => sampleGrid(sim, sim.D, x, y, z),
  };
}

/** Index of the sub-cell containing (x, y, z), or -1 outside the grid. */
export function cellAt(sim, x, y, z) {
  const i = Math.floor((x - sim.ox) * sim.n), j = Math.floor((y - sim.oy) * sim.n);
  const k = sim.NZ > 1 ? Math.floor((z - sim.oz) * sim.n) : 0;
  if (i < 0 || j < 0 || k < 0 || i >= sim.NX || j >= sim.NY || k >= sim.NZ) return -1;
  return (k * sim.NY + j) * sim.NX + i;
}
export const matAt = (sim, x, y, z) => {
  const c = cellAt(sim, x, y, z);
  return c < 0 ? 0 : sim.phases[sim.label[c]]?.mat ?? 0;
};

/** First sign change of F along p + t·d (d normalised), t ∈ (0, maxT]. */
export function crossing(F, p, dir, maxT = 3, h = 1 / 128) {
  const l = Math.hypot(...dir);
  const d = dir.map((v) => v / l);
  const at = (t) => F(p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t);
  const s0 = at(0) > 0;
  let prev = 0;
  for (let t = h; t <= maxT + 1e-9; t += h) {
    if ((at(t) > 0) !== s0) {
      let a = prev, b = t;
      for (let i = 0; i < 30; i++) { const m = 0.5 * (a + b); if ((at(m) > 0) === s0) a = m; else b = m; }
      const tt = 0.5 * (a + b);
      return { t: tt, p: [p[0] + d[0] * tt, p[1] + d[1] * tt, p[2] + d[2] * tt], from: s0 };
    }
    prev = t;
  }
  return null;
}

/** Algebraic (Kasa) circle fit to 2D points → {cx, cy, R, rms}. */
export function fitCircle(pts) {
  if (pts.length < 5) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  const mx = sx / pts.length, my = sy / pts.length;
  let Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  for (const [x, y] of pts) {
    const u = x - mx, v = y - my;
    Suu += u * u; Svv += v * v; Suv += u * v;
    Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u;
  }
  const a = Suu, b = Suv, c = Suv, d = Svv;
  const e = 0.5 * (Suuu + Suvv), f = 0.5 * (Svvv + Svuu);
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const uc = (e * d - b * f) / det, vc = (a * f - c * e) / det;
  const R = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / pts.length);
  const cx = uc + mx, cy = vc + my;
  let rr = 0;
  for (const [x, y] of pts) rr += (Math.hypot(x - cx, y - cy) - R) ** 2;
  return { cx, cy, R, rms: Math.sqrt(rr / pts.length) };
}

/**
 * Rounding of a convex 90° edge seen in a slice. `anchor` is an interior
 * point, `ua`/`va` the slice axes, the sharp corner sits at anchor + a·e_ua
 * + a·e_va (a > 0). Rays from the anchor over 0–90° give the profile; the
 * face positions are the 0° and 90° hits; the points more than `tol` inside
 * both faces are the rounded part, fitted with a circle. `inset` is the
 * distance from the sharp corner to the surface along the 45° ray; a circular
 * fillet of radius R tangent to both faces has inset R(√2 − 1).
 */
export function edgeRound(F, anchor, ua, va, a, tol = 0.02) {
  const pts = [];
  for (let deg = 0; deg <= 90.0001; deg += 0.5) {
    const th = (deg * Math.PI) / 180;
    const dir = [0, 0, 0];
    dir[ua] = Math.cos(th); dir[va] = Math.sin(th);
    const r = crossing(F, anchor, dir, 3 * a + 1.5);
    if (r) pts.push([r.p[ua] - anchor[ua], r.p[va] - anchor[va], deg]);
  }
  if (pts.length < 10) return null;
  const uFace = pts[0][0], vFace = pts[pts.length - 1][1];
  const curved = pts.filter(([u, v]) => u < uFace - tol && v < vFace - tol).map(([u, v]) => [u, v]);
  const fit = fitCircle(curved);
  const p45 = pts.find((p) => Math.abs(p[2] - 45) < 1e-6);
  const inset = p45 ? Math.hypot(a - p45[0], a - p45[1]) * (p45[0] < a ? 1 : -1) : null;
  return {
    faceU: uFace - a, faceV: vFace - a, // face displacement (+ = bulged out)
    inset, Req: inset == null ? null : inset / (Math.SQRT2 - 1),
    R: fit ? fit.R : null, fitRms: fit ? fit.rms : null, nCurved: curved.length,
    arcDeg: curved.length ? (() => { const ang = pts.filter(([u, v]) => u < uFace - tol && v < vFace - tol).map((p) => p[2]); return Math.max(...ang) - Math.min(...ang); })() : 0,
  };
}

/** Inset of the surface from a sharp 3D vertex along the body diagonal. */
export function cornerInset(F, center, corner) {
  const dir = corner.map((v, t) => v - center[t]);
  const L = Math.hypot(...dir);
  const r = crossing(F, center, dir, 2 * L);
  if (!r) return null;
  const inset = L - r.t;
  return { inset, Req: inset / (Math.sqrt(3) - 1) };
}

/** Extent of the solid along an axis through p (both directions). */
export function extentThrough(F, p, axis, maxT = 4) {
  const d = [0, 0, 0]; d[axis] = 1;
  const a = crossing(F, p, d, maxT), b = crossing(F, p, d.map((v) => -v), maxT);
  if (!a || !b) return null;
  return a.t + b.t;
}

/** Top surface height above (x, z), scanning down from yTop. */
export function topY(F, x, z, yTop, yBot) {
  const r = crossing(F, [x, yTop, z], [0, -1, 0], yTop - yBot);
  return r && !r.from ? r.p[1] : null;
}
export function botY(F, x, z, yBot, yTop) {
  const r = crossing(F, [x, yBot, z], [0, 1, 0], yTop - yBot);
  return r && !r.from ? r.p[1] : null;
}

/** Max |height − h0| of the top (or bottom) over a list of (x, z) points. */
export function flatness(F, pts, h0, { yTop, yBot, bottom = false }) {
  let maxUp = -Infinity, maxDown = Infinity, miss = 0;
  for (const [x, z] of pts) {
    const y = bottom ? botY(F, x, z, yBot, yTop) : topY(F, x, z, yTop, yBot);
    if (y == null) { miss++; continue; }
    maxUp = Math.max(maxUp, y - h0); maxDown = Math.min(maxDown, y - h0);
  }
  return { maxUp: maxUp === -Infinity ? null : maxUp, maxDown: maxDown === Infinity ? null : maxDown,
    maxAbs: maxUp === -Infinity ? null : Math.max(Math.abs(maxUp), Math.abs(maxDown)), miss, n: pts.length };
}

export const grid2 = (x0, x1, z0, z1, h = 0.125, keep = () => true) => {
  const out = [];
  for (let x = x0; x <= x1 + 1e-9; x += h) for (let z = z0; z <= z1 + 1e-9; z += h) if (keep(x, z)) out.push([x, z]);
  return out;
};

/** Least-squares line through (x, y) points → slope. */
export function slope(pts) {
  if (pts.length < 3) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const n = pts.length;
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

/**
 * Groove at a straight seam x = xs (seam along z) on a flat top at height h0.
 * Profile y(x) on the line z = zc; depth = flat level − lowest point within
 * 0.5 of the seam; side slopes from line fits over windows [xs ± w0, xs ± w1];
 * angle φ = rise of each flank above horizontal; opening = 180 − φL − φR.
 */
export function groove(F, xs, zc, h0, { flatL, flatR, yTop, yBot, windows = [[0.06, 0.25], [0.1, 0.4]] }) {
  const prof = [];
  for (let x = xs - 2.5; x <= xs + 2.5 + 1e-9; x += 1 / 64) {
    const y = topY(F, x, zc, yTop, yBot);
    if (y != null) prof.push([x, y]);
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const fl = prof.filter(([x]) => x >= flatL[0] && x <= flatL[1]).map((p) => p[1]);
  const fr = prof.filter(([x]) => x >= flatR[0] && x <= flatR[1]).map((p) => p[1]);
  const near = prof.filter(([x]) => Math.abs(x - xs) <= 0.5);
  const low = near.reduce((m, p) => (p[1] < m[1] ? p : m), [xs, Infinity]);
  const flat = fl.length && fr.length ? 0.5 * (mean(fl) + mean(fr)) : null;
  const ang = windows.map(([w0, w1]) => {
    const L = prof.filter(([x]) => x <= xs - w0 && x >= xs - w1);
    const R = prof.filter(([x]) => x >= xs + w0 && x <= xs + w1);
    const sL = slope(L), sR = slope(R);
    const phiL = sL == null ? null : (Math.atan(-sL) * 180) / Math.PI; // rises to the left
    const phiR = sR == null ? null : (Math.atan(sR) * 180) / Math.PI;
    return { window: [w0, w1], phiL, phiR, opening: phiL == null || phiR == null ? null : 180 - phiL - phiR };
  });
  // half-width: distance from the seam to where the profile is within 0.01 of flat
  let halfW = null;
  if (flat != null) {
    const R = prof.filter(([x]) => x > xs);
    const firstFlat = R.find(([, y]) => y >= flat - 0.01);
    halfW = firstFlat ? firstFlat[0] - xs : null;
  }
  return { flatL: fl.length ? mean(fl) : null, flatR: fr.length ? mean(fr) : null, flatVsOrig: flat == null ? null : flat - h0,
    depth: flat == null ? null : flat - low[1], lowestAt: low[0] - xs, halfWidth: halfW, angles: ang,
    profile: prof.filter((_, i) => i % 4 === 0).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) };
}

/** Shape change: sub-cells whose material differs from the start, per block volume. */
export function shapeChange(sim) {
  let diff = 0, solid0 = 0;
  for (let c = 0; c < sim.N; c++) {
    const o = sim.orig[c], l = sim.label[c];
    if (o) solid0++;
    const mo = o ? sim.phases[o].mat : 0, ml = l ? sim.phases[l].mat : 0;
    if (mo !== ml) diff++;
  }
  return diff / solid0;
}

/** Solid volume (blocks) of the D > 0 region and of the labels. */
export function volumeErrors(sim) {
  let dCount = 0, lCount = 0, blocks = 0;
  for (let c = 0; c < sim.N; c++) { if (sim.D[c] > 0) dCount++; if (sim.label[c]) lCount++; }
  for (let p = 1; p < sim.phases.length; p++) if (sim.root[p] === p || sim.phases[p].alive) blocks += 0;
  const total = sim.blocks.length;
  const counts = new Float64Array(sim.phases.length);
  for (let c = 0; c < sim.N; c++) counts[sim.label[c]]++;
  let worstPhase = 0;
  for (let p = 1; p < sim.phases.length; p++) {
    const P = sim.phases[p];
    if (!P.alive) continue;
    worstPhase = Math.max(worstPhase, Math.abs(counts[p] - P.target) / P.target);
  }
  return { labTotalRel: lCount / sim.cellVol / total - 1, DTotalRel: dCount / sim.cellVol / total - 1, labWorstPhaseRel: worstPhase };
}

/** Live phases per material. */
export function phaseCounts(sim) {
  const out = {};
  for (let p = 1; p < sim.phases.length; p++) {
    const P = sim.phases[p];
    if (!P.alive) continue;
    out[P.mat] = (out[P.mat] ?? 0) + 1;
  }
  return out;
}
export function startCounts(sim) {
  const out = {};
  for (let p = 1; p < sim.phases.length; p++) out[sim.phases[p].mat] = (out[sim.phases[p].mat] ?? 0) + 1;
  return out;
}

/**
 * Diagonal band (slab-line): along s = (x + z)/√2 between sLo and sHi, the
 * width of material `m` across t = (x − z)/√2 ∈ [−1.5, 1.5], read from the
 * material of the topmost solid sub-cell of each column ("top") or of the
 * sub-cell at height y ("mid"). Returns mean width and its std (a straight
 * band of constant width has std 0; the block staircase has std ≈ 0.41).
 */
export function bandWidth(sim, m, sLo, sHi, { mode = 'top', y = 0.5, yTop = 1.5 } = {}) {
  const ws = [];
  const r2 = Math.SQRT1_2;
  for (let s = sLo; s <= sHi + 1e-9; s += 1 / 64) {
    let cnt = 0;
    for (let t = -1.5; t <= 1.5 + 1e-9; t += 1 / 128) {
      const x = (s + t) * r2, z = (s - t) * r2;
      let mat = 0;
      if (mode === 'mid') mat = matAt(sim, x, y, z);
      else {
        for (let yy = yTop; yy > -0.5; yy -= 1 / sim.n) { const q = matAt(sim, x, yy, z); if (q) { mat = q; break; } }
      }
      if (mat === m) cnt++;
    }
    ws.push(cnt / 128);
  }
  const mean = ws.reduce((a, b) => a + b, 0) / ws.length;
  const sd = Math.sqrt(ws.reduce((a, b) => a + (b - mean) ** 2, 0) / ws.length);
  return { mean, sd, min: Math.min(...ws), max: Math.max(...ws) };
}

/**
 * Tunnel clearance in the slice z = zc: for x in [x0, x1] the vertical air
 * interval containing y = yc, then the largest clear height of a window of
 * width w (the 0.70 × 1.90 test) and the largest clear width for height h.
 */
export function tunnelClear(F, zc, yc, x0, x1, { w = 0.7, h = 1.9 } = {}) {
  const dx = 1 / 64, cols = [];
  for (let x = x0; x <= x1 + 1e-9; x += dx) {
    if (F(x, yc, zc) > 0) { cols.push([x, null, null]); continue; }
    const up = crossing(F, [x, yc, zc], [0, 1, 0], 3), dn = crossing(F, [x, yc, zc], [0, -1, 0], 3);
    cols.push([x, dn ? dn.p[1] : -Infinity, up ? up.p[1] : Infinity]);
  }
  const win = (i0, nW) => {
    let lo = -Infinity, hi = Infinity;
    for (let i = i0; i < i0 + nW; i++) { const c = cols[i]; if (c[1] == null) return 0; lo = Math.max(lo, c[1]); hi = Math.min(hi, c[2]); }
    return Math.max(0, hi - lo);
  };
  const nW = Math.round(w / dx) + 1;
  let Hw = 0;
  for (let i = 0; i + nW <= cols.length; i++) Hw = Math.max(Hw, win(i, nW));
  let Wh = 0;
  for (let nn = 2; nn <= cols.length; nn++) {
    let ok = false;
    for (let i = 0; i + nn <= cols.length; i++) if (win(i, nn) >= h) { ok = true; break; }
    if (ok) Wh = (nn - 1) * dx; else break;
  }
  const mid = cols[Math.round((cols.length - 1) / 2)];
  return { clearHeightAtW: Hw, clearWidthAtH: Wh, heightAtCentre: mid[1] == null ? 0 : mid[2] - mid[1],
    pass: Hw >= h - 1 / 128 };
}

/**
 * Are the sub-cells of material `mat` near p0 and near p1 connected (face
 * adjacency) inside the block-coordinate box [lo, hi]? Seeds are the cells of
 * that material nearest to p0 / p1 within 0.35 block (else false).
 */
export function connectedIn(sim, mat, p0, p1, lo, hi) {
  const { n, NX, NY, NZ, ox, oy, oz } = sim;
  const toI = (v, o) => Math.floor((v - o) * n);
  const i0 = Math.max(0, toI(lo[0], ox)), i1 = Math.min(NX - 1, toI(hi[0], ox) - 1);
  const j0 = Math.max(0, toI(lo[1], oy)), j1 = Math.min(NY - 1, toI(hi[1], oy) - 1);
  const k0 = NZ > 1 ? Math.max(0, toI(lo[2], oz)) : 0, k1 = NZ > 1 ? Math.min(NZ - 1, toI(hi[2], oz) - 1) : 0;
  const m = (c) => (sim.label[c] ? sim.phases[sim.label[c]].mat : 0);
  const seed = (p) => {
    let best = -1, bd = Infinity;
    const r = Math.ceil(0.35 * n);
    const ci = toI(p[0], ox), cj = toI(p[1], oy), ck = NZ > 1 ? toI(p[2], oz) : 0;
    for (let dk = (NZ > 1 ? -r : 0); dk <= (NZ > 1 ? r : 0); dk++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj, k = ck + dk;
      if (i < i0 || i > i1 || j < j0 || j > j1 || k < k0 || k > k1) continue;
      const c = (k * NY + j) * NX + i;
      if (m(c) !== mat) continue;
      const d = di * di + dj * dj + dk * dk;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const a = seed(p0), b = seed(p1);
  if (a < 0 || b < 0) return false;
  const seen = new Uint8Array(sim.N);
  const q = [a]; seen[a] = 1;
  while (q.length) {
    const c = q.pop();
    if (c === b) return true;
    const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
    const nb = [[i - 1, j, k], [i + 1, j, k], [i, j - 1, k], [i, j + 1, k], [i, j, k - 1], [i, j, k + 1]];
    for (const [x, y, z] of nb) {
      if (x < i0 || x > i1 || y < j0 || y > j1 || z < k0 || z > k1) continue;
      const c2 = (z * NY + y) * NX + x;
      if (seen[c2] || m(c2) !== mat) continue;
      seen[c2] = 1; q.push(c2);
    }
  }
  return false;
}

/** Junction outcome on a flat layer at the X junction (k, ·, k): which
 *  diagonal pair is connected through the 2×2-block window around it. */
export function junction(sim, k, matDiag, matAnti, yLo = -0.6, yHi = 1.6) {
  const lo = [k - 1, yLo, k - 1], hi = [k + 1, yHi, k + 1];
  const a = connectedIn(sim, matDiag, [k - 0.5, 0.5, k - 0.5], [k + 0.5, 0.5, k + 0.5], lo, hi);
  const b = matAnti ? connectedIn(sim, matAnti, [k + 0.5, 0.5, k - 0.5], [k - 0.5, 0.5, k + 0.5], lo, hi) : false;
  return a && b ? 'X' : a ? 'A' : b ? 'B' : '-';
}

/**
 * Cell-exact tunnel clearance on the labels (no interpolation): in the plane
 * of cells containing z = zc, each column's air run around y = yc gives
 * [floor, roof] at sub-cell edges; a w-wide window overlaps ceil(w·n)
 * columns; clear height = max over windows of min roof − max floor.
 */
export function tunnelClearCells(sim, zc, yc, x0, x1, w = 0.7, h = 1.9) {
  const { n, NX, NY, NZ, ox, oy, oz, label } = sim;
  const k = NZ > 1 ? Math.floor((zc - oz) * n) : 0, jc = Math.floor((yc - oy) * n);
  const cols = [];
  for (let i = Math.floor((x0 - ox) * n); i < Math.ceil((x1 - ox) * n); i++) {
    const at = (j) => label[(k * NY + j) * NX + i];
    if (at(jc)) { cols.push(null); continue; }
    let lo = jc, hi = jc;
    while (lo - 1 >= 0 && !at(lo - 1)) lo--;
    while (hi + 1 < NY && !at(hi + 1)) hi++;
    cols.push([oy + lo / n, oy + (hi + 1) / n]);
  }
  const best = (m) => {
    let b = 0;
    for (let a = 0; a + m <= cols.length; a++) {
      let lo = -Infinity, hi = Infinity, ok = true;
      for (let q = a; q < a + m; q++) { const c = cols[q]; if (!c) { ok = false; break; } lo = Math.max(lo, c[0]); hi = Math.min(hi, c[1]); }
      if (ok) b = Math.max(b, hi - lo);
    }
    return b;
  };
  const mW = Math.ceil(w * n - 1e-9);
  const Hw = best(mW);
  let Wh = 0;
  for (let m = 1; m <= cols.length; m++) { if (best(m) >= h - 1e-9) Wh = m / n; else break; }
  return { clearHeightAtW: Hw, clearWidthAtH: Wh, pass: Hw >= h - 1e-9 };
}
