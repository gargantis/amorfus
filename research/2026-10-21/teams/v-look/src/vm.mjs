// Verifier v-look: measurements on the LABELS (cell-exact, independent of
// the look team's lm.mjs except where noted). Block coordinates, y up.

export const matOf = (sim, p) => (p ? sim.phases[p].mat : 0);
const idx = (sim, i, j, k) => (k * sim.NY + j) * sim.NX + i;
const ci = (sim, x) => Math.floor((x - sim.ox) * sim.n + 1e-9);
const cj = (sim, y) => Math.floor((y - sim.oy) * sim.n + 1e-9);
const ck = (sim, z) => (sim.NZ > 1 ? Math.floor((z - sim.oz) * sim.n + 1e-9) : 0);
const xc = (sim, i) => sim.ox + (i + 0.5) / sim.n;
const yc = (sim, j) => sim.oy + (j + 0.5) / sim.n;
const zc = (sim, k) => sim.oz + (k + 0.5) / sim.n;

/** Top surface per sub-cell column over [x0,x1]×[z0,z1] (block coords),
 *  scanning down from yMax: {W, H, top (block y of the top face, NaN = none),
 *  mat (final), mat0 (original top material at the same scan)}. */
export function topMap(sim, x0, x1, z0, z1, yMax) {
  const i0 = ci(sim, x0), i1 = ci(sim, x1 - 1e-6), k0 = ck(sim, z0), k1 = ck(sim, z1 - 1e-6);
  const jTop = Math.min(sim.NY - 1, cj(sim, yMax - 1e-6));
  const W = i1 - i0 + 1, H = k1 - k0 + 1;
  const top = new Float64Array(W * H).fill(NaN), mat = new Uint8Array(W * H), mat0 = new Uint8Array(W * H), top0 = new Float64Array(W * H).fill(NaN);
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const q = (k - k0) * W + (i - i0);
    for (let j = jTop; j >= 0; j--) { const c = idx(sim, i, j, k); if (sim.label[c]) { top[q] = sim.oy + (j + 1) / sim.n; mat[q] = matOf(sim, sim.label[c]); break; } }
    for (let j = jTop; j >= 0; j--) { const c = idx(sim, i, j, k); if (sim.orig[c]) { top0[q] = sim.oy + (j + 1) / sim.n; mat0[q] = matOf(sim, sim.orig[c]); break; } }
  }
  return { W, H, i0, k0, top, mat, mat0, top0, n: sim.n, x: (i) => xc(sim, i0 + i), z: (k) => zc(sim, k0 + k) };
}

/** Flatness of the top over the columns whose centre is inside [x0,x1]×[z0,z1]. */
export function flatTop(sim, x0, x1, z0, z1, h0, yMax) {
  const T = topMap(sim, x0, x1, z0, z1, yMax);
  let maxUp = 0, maxDown = 0, dev = 0, miss = 0;
  for (let q = 0; q < T.top.length; q++) {
    const t = T.top[q];
    if (Number.isNaN(t)) { miss++; continue; }
    const d = t - h0;
    if (Math.abs(d) > 1e-9) dev++;
    maxUp = Math.max(maxUp, d); maxDown = Math.min(maxDown, d);
  }
  return { maxUp: +maxUp.toFixed(4), maxDown: +maxDown.toFixed(4), maxAbs: +Math.max(maxUp, -maxDown).toFixed(4), colsOff: dev, cols: T.top.length, miss };
}

/** 4-connected components of value m in a W×H map. */
export function components(map, W, H, m) {
  const seen = new Uint8Array(W * H);
  let count = 0;
  const sizes = [];
  for (let s = 0; s < W * H; s++) {
    if (map[s] !== m || seen[s]) continue;
    count++;
    let sz = 0;
    const st = [s]; seen[s] = 1;
    while (st.length) {
      const c = st.pop(); sz++;
      const x = c % W, z = (c - x) / W;
      for (const [a, b] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const d = b * W + a;
        if (!seen[d] && map[d] === m) { seen[d] = 1; st.push(d); }
      }
    }
    sizes.push(sz);
  }
  return { count, sizes: sizes.sort((p, q) => q - p) };
}

/** Paint statistics of material m on the top surface vs the start. */
export function paintStats(sim, x0, x1, z0, z1, yMax, m) {
  const T = topMap(sim, x0, x1, z0, z1, yMax);
  const a2 = 1 / (sim.n * sim.n);
  let A1 = 0, A0 = 0, gained = 0, lost = 0;
  for (let q = 0; q < T.mat.length; q++) {
    const f = T.mat[q] === m, o = T.mat0[q] === m;
    if (f) A1++; if (o) A0++;
    if (f && !o) gained++; if (o && !f) lost++;
  }
  // per-block majority accuracy over whole blocks in the window
  let blocksWrong = 0, blocks = 0;
  const bx0 = Math.ceil(x0), bx1 = Math.floor(x1), bz0 = Math.ceil(z0), bz1 = Math.floor(z1);
  for (let bz = bz0; bz < bz1; bz++) for (let bx = bx0; bx < bx1; bx++) {
    let cm = 0, c0 = 0, tot = 0;
    for (let q = 0; q < T.mat.length; q++) {
      const i = q % T.W, k = (q - i) / T.W;
      const x = T.x(i), z = T.z(k);
      if (x < bx || x >= bx + 1 || z < bz || z >= bz + 1) continue;
      tot++; if (T.mat[q] === m) cm++; if (T.mat0[q] === m) c0++;
    }
    if (!tot) continue;
    blocks++;
    if ((cm * 2 > tot) !== (c0 * 2 > tot)) blocksWrong++;
  }
  const C1 = components(T.mat, T.W, T.H, m), C0 = components(T.mat0, T.W, T.H, m);
  return {
    area0: +(A0 * a2).toFixed(4), area: +(A1 * a2).toFixed(4), areaRatio: A0 ? +(A1 / A0).toFixed(4) : null,
    gained: +(gained * a2).toFixed(4), lost: +(lost * a2).toFixed(4),
    parts0: C0.count, parts: C1.count, partSizes: C1.sizes.slice(0, 6).map((s) => +(s * a2).toFixed(3)),
    blocksWrong, blocks,
  };
}

/** Phase-level paint: volume of material m below depth `yBelow` (cells whose
 *  centre y < yBelow) at the end vs the start, in blocks³. */
export function matBelow(sim, m, yBelow) {
  let f = 0, o = 0;
  const jMax = cj(sim, yBelow - 1e-9);
  for (let k = 0; k < sim.NZ; k++) for (let j = 0; j <= jMax && j < sim.NY; j++) for (let i = 0; i < sim.NX; i++) {
    const c = idx(sim, i, j, k);
    if (sim.label[c] && matOf(sim, sim.label[c]) === m) f++;
    if (sim.orig[c] && matOf(sim, sim.orig[c]) === m) o++;
  }
  const v = sim.n ** 3;
  return { start: +(o / v).toFixed(4), end: +(f / v).toFixed(4) };
}

/** Width of material m across a line, along the line, read from the top map.
 *  Line: points p(s) = P0 + s·u (u unit, in x–z), across-direction v; for each s
 *  step 1/32, count top-map columns of m within |t| ≤ tMax along v (sampling
 *  1/64). Returns the profile and window stats. */
export function lineWidth(sim, P0, u, sLo, sHi, yMax, m, tMax = 1.5) {
  const v = [-u[1], u[0]];
  const prof = [];
  for (let s = sLo; s <= sHi + 1e-9; s += 1 / 32) {
    let cnt = 0;
    for (let t = -tMax; t <= tMax + 1e-9; t += 1 / 64) {
      const x = P0[0] + s * u[0] + t * v[0], z = P0[1] + s * u[1] + t * v[1];
      const i = ci(sim, x), k = ck(sim, z);
      if (i < 0 || k < 0 || i >= sim.NX || k >= sim.NZ) continue;
      let mt = 0;
      for (let j = Math.min(sim.NY - 1, cj(sim, yMax - 1e-6)); j >= 0; j--) { const c = idx(sim, i, j, k); if (sim.label[c]) { mt = matOf(sim, sim.label[c]); break; } }
      if (mt === m) cnt++;
    }
    prof.push([+s.toFixed(4), cnt / 64]);
  }
  const ws = prof.map((p) => p[1]);
  const mean = ws.reduce((a, b) => a + b, 0) / ws.length;
  const sd = Math.sqrt(ws.reduce((a, b) => a + (b - mean) ** 2, 0) / ws.length);
  return { mean: +mean.toFixed(4), sd: +sd.toFixed(4), min: Math.min(...ws), max: Math.max(...ws), prof };
}

/** Opening in the plane z = zc (cell-exact): columns over [x0,x1], each the air
 *  run around y = yc0; clear height for a window of width w, clear width for
 *  height h. Independent re-implementation of the look team's tunnelClearCells. */
export function opening(sim, zcut, ycen, x0, x1, w, h) {
  const k = ck(sim, zcut), jc = cj(sim, ycen);
  const cols = [];
  for (let i = ci(sim, x0); i <= ci(sim, x1 - 1e-6); i++) {
    if (sim.label[idx(sim, i, jc, k)]) { cols.push(null); continue; }
    let lo = jc, hi = jc;
    while (lo > 0 && !sim.label[idx(sim, i, lo - 1, k)]) lo--;
    while (hi < sim.NY - 1 && !sim.label[idx(sim, i, hi + 1, k)]) hi++;
    cols.push([sim.oy + lo / sim.n, sim.oy + (hi + 1) / sim.n]);
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
  const mw = Math.ceil(w * sim.n - 1e-9);
  const H = best(mw);
  let Wd = 0;
  for (let m = 1; m <= cols.length; m++) { if (best(m) >= h - 1e-9) Wd = m / sim.n; else break; }
  const mid = cols[Math.floor(cols.length / 2)];
  return { clearH: +H.toFixed(4), clearW: +Wd.toFixed(4), pass: H >= h - 1e-9 && Wd >= w - 1e-9, floorMid: mid ? +mid[0].toFixed(4) : null, roofMid: mid ? +mid[1].toFixed(4) : null };
}

/** Horizontal air gap around x = xcen in row y, plane z (cell-exact), and the
 *  minimum over rows with centre y in [y0, y1]. */
export function gapRows(sim, zcut, xcen, y0, y1) {
  const k = ck(sim, zcut), ic = ci(sim, xcen);
  let minW = Infinity, at = null;
  for (let j = cj(sim, y0); j <= cj(sim, y1 - 1e-6); j++) {
    if (sim.label[idx(sim, ic, j, k)]) { minW = 0; at = yc(sim, j); break; }
    let lo = ic, hi = ic;
    while (lo > 0 && !sim.label[idx(sim, lo - 1, j, k)]) lo--;
    while (hi < sim.NX - 1 && !sim.label[idx(sim, hi + 1, j, k)]) hi++;
    const w = (hi - lo + 1) / sim.n;
    if (w < minW) { minW = w; at = yc(sim, j); }
  }
  return { minW: +minW.toFixed(4), atY: at == null ? null : +at.toFixed(4) };
}

/** Solid extent along an axis-aligned or diagonal line through p (labels,
 *  cell-exact steps of 1/(4n)). */
export function extent(sim, p, d) {
  const L = Math.hypot(...d); const u = d.map((v) => v / L);
  const solid = (t) => { const x = p[0] + u[0] * t, y = p[1] + u[1] * t, z = p[2] + u[2] * t; const i = ci(sim, x), j = cj(sim, y), k = ck(sim, z); if (i < 0 || j < 0 || k < 0 || i >= sim.NX || j >= sim.NY || k >= sim.NZ) return false; return !!sim.label[idx(sim, i, j, k)]; };
  if (!solid(0)) return 0;
  const h = 1 / (4 * sim.n);
  let a = 0, b = 0;
  while (solid(a + h) && a < 5) a += h;
  while (solid(-(b + h)) && b < 5) b += h;
  return +(a + b + h).toFixed(4);
}

/** Cells whose material changed, per original solid block volume. */
export function shapeChange(sim) {
  let diff = 0, s0 = 0, geo = 0;
  for (let c = 0; c < sim.N; c++) {
    const o = sim.orig[c], l = sim.label[c];
    if (o) s0++;
    if (matOf(sim, o) !== matOf(sim, l)) diff++;
    if (!!o !== !!l) geo++;
  }
  return { delta: +(diff / s0).toFixed(4), geoDelta: +(geo / s0).toFixed(4) };
}

/** Solid-volume check per material and per live phase. */
export function vols(sim) {
  const c = new Float64Array(sim.phases.length), c0 = new Float64Array(sim.phases.length);
  for (let q = 0; q < sim.N; q++) { c[sim.label[q]]++; }
  let worst = 0;
  for (let p = 1; p < sim.phases.length; p++) { const P = sim.phases[p]; if (!P.alive) continue; worst = Math.max(worst, Math.abs(c[p] - P.target) / P.target); }
  return { worstPhaseRel: +worst.toFixed(5) };
}

export function phaseCounts(sim) {
  const out = {};
  for (let p = 1; p < sim.phases.length; p++) if (sim.phases[p].alive) out[sim.phases[p].mat] = (out[sim.phases[p].mat] ?? 0) + 1;
  return out;
}
