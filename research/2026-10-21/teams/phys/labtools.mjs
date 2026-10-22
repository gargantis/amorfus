// Label-based measurement tools (team phys). Everything here reads the
// engine's final labels (sim.label: phase per sub-cell, 0 = air), never the
// re-blurred render field D, unless a function says otherwise.
import { DEFAULTS, setup, run, finish } from '../../lib/mbo.mjs';

/** simulate() split so that the run's own pressures (lambda before the
 *  render re-solve) can be read. Returns sim with sim.lambdaRun[p]. */
export function simulateKeep(blocks, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (opts.dims === 2 && opts.n === undefined) o.n = 32;
  const sim = setup(blocks, o);
  sim.opts = o;
  const t0 = performance.now();
  run(sim, o);
  sim.ms = performance.now() - t0;
  sim.lambdaRun = sim.phases.map((P) => P.lambda ?? 0);
  finish(sim, o);
  return sim;
}

export const cellXYZ = (sim, c) => {
  const { NX, NY, n, ox, oy, oz, NZ } = sim;
  const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
  return [ox + (i + 0.5) / n, oy + (j + 0.5) / n, NZ > 1 ? oz + (k + 0.5) / n : 0];
};

/** Face centres between a cell of phase a and a cell of phase b (either
 *  order). Each entry [x, y, z, axis]. */
export function facePoints(sim, a, b) {
  const { NX, NY, NZ, n, ox, oy, oz, label } = sim;
  const out = [];
  const strides = NZ > 1 ? [1, NX, NX * NY] : [1, NX];
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = (k * NY + j) * NX + i;
    const la = label[c];
    for (let ax = 0; ax < strides.length; ax++) {
      if ((ax === 0 && i === NX - 1) || (ax === 1 && j === NY - 1) || (ax === 2 && k === NZ - 1)) continue;
      const lb = label[c + strides[ax]];
      if ((la === a && lb === b) || (la === b && lb === a)) {
        const p = [ox + (i + 0.5) / n, oy + (j + 0.5) / n, NZ > 1 ? oz + (k + 0.5) / n : 0];
        p[ax] += 0.5 / n;
        out.push([p[0], p[1], p[2], ax]);
      }
    }
  }
  return out;
}

/** Solve a small dense linear system (Gaussian elimination, partial pivot). */
export function solve(A, b) {
  const m = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) continue;
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[m] / r[i]);
}

/** Algebraic (Kasa) sphere fit in 3D, or circle fit if dims = 2. */
export function fitSphere(pts, dims = 3) {
  const m = dims + 1;
  const A = Array.from({ length: m }, () => new Array(m).fill(0));
  const b = new Array(m).fill(0);
  for (const p of pts) {
    const row = [...p.slice(0, dims), 1];
    const rhs = -p.slice(0, dims).reduce((s, v) => s + v * v, 0);
    for (let i = 0; i < m; i++) { b[i] += row[i] * rhs; for (let j = 0; j < m; j++) A[i][j] += row[i] * row[j]; }
  }
  const s = solve(A, b);
  const c = s.slice(0, dims).map((v) => -v / 2);
  const r = Math.sqrt(c.reduce((t, v) => t + v * v, 0) - s[dims]);
  let ss = 0, mx = 0;
  for (const p of pts) {
    const dd = Math.hypot(...p.slice(0, dims).map((v, i) => v - c[i])) - r;
    ss += dd * dd; mx = Math.max(mx, Math.abs(dd));
  }
  return { c, r, rms: Math.sqrt(ss / pts.length), maxDev: mx, count: pts.length };
}

/** Least-squares plane through points: normal = smallest-eigenvalue
 *  eigenvector of the covariance (power iteration on the inverse-shifted
 *  matrix). Returns {n, d, rms, maxDev} with n.p = d. */
export function fitPlane(pts) {
  const m = [0, 0, 0];
  for (const p of pts) for (let i = 0; i < 3; i++) m[i] += p[i] / pts.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - m[i]) * (p[j] - m[j]);
  // smallest eigenvector via Jacobi rotations
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const a = C.map((r) => r.slice());
  for (let sweep = 0; sweep < 50; sweep++) {
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
      const c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  let imin = 0;
  for (let i = 1; i < 3; i++) if (a[i][i] < a[imin][imin]) imin = i;
  const nrm = [V[0][imin], V[1][imin], V[2][imin]];
  const d = nrm[0] * m[0] + nrm[1] * m[1] + nrm[2] * m[2];
  let ss = 0, mx = 0;
  for (const p of pts) { const e = nrm[0] * p[0] + nrm[1] * p[1] + nrm[2] * p[2] - d; ss += e * e; mx = Math.max(mx, Math.abs(e)); }
  return { n: nrm, d, rms: Math.sqrt(ss / pts.length), maxDev: mx };
}

/** Relabel cells so that every face-connected component of every phase
 *  gets its own id (air stays 0): a merged phase whose parts drifted apart
 *  counts as separate bodies, as it would physically. */
export function componentLabels(sim) {
  const { NX, NY, NZ, N, label } = sim;
  const out = new Int32Array(N);
  let next = 1;
  const stack = new Int32Array(N);
  for (let c0 = 0; c0 < N; c0++) {
    const p = label[c0];
    if (!p || out[c0]) continue;
    const id = next++;
    let top = 0; stack[top++] = c0; out[c0] = id;
    while (top) {
      const c = stack[--top];
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      const nb = [];
      if (i > 0) nb.push(c - 1); if (i < NX - 1) nb.push(c + 1);
      if (j > 0) nb.push(c - NX); if (j < NY - 1) nb.push(c + NX);
      if (NZ > 1) { if (k > 0) nb.push(c - NX * NY); if (k < NZ - 1) nb.push(c + NX * NY); }
      for (const q of nb) if (!out[q] && label[q] === p) { out[q] = id; stack[top++] = q; }
    }
  }
  return out;
}

/** Number of face-connected components of phase p's cells, with sizes. */
export function components(sim, p) {
  const { NX, NY, NZ, N, label } = sim;
  const seen = new Uint8Array(N);
  const sizes = [];
  const stack = new Int32Array(N);
  for (let c0 = 0; c0 < N; c0++) {
    if (label[c0] !== p || seen[c0]) continue;
    let top = 0, size = 0;
    stack[top++] = c0; seen[c0] = 1;
    while (top) {
      const c = stack[--top]; size++;
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      const nb = [];
      if (i > 0) nb.push(c - 1); if (i < NX - 1) nb.push(c + 1);
      if (j > 0) nb.push(c - NX); if (j < NY - 1) nb.push(c + NX);
      if (NZ > 1) { if (k > 0) nb.push(c - NX * NY); if (k < NZ - 1) nb.push(c + NX * NY); }
      for (const q of nb) if (!seen[q] && label[q] === p) { seen[q] = 1; stack[top++] = q; }
    }
    sizes.push(size);
  }
  return sizes.sort((x, y) => y - x);
}

/** Junction census over sub-cell corners: how many distinct phases meet at
 *  each interior lattice corner of the sub-cell grid (8 cells in 3D, 4 in
 *  2D). Corners with >= 4 phases (3D) / >= 4 (2D) are grouped into
 *  26-connected (8-connected) components; each component reports its
 *  phase set, corner count and extent in blocks (largest bounding-box side).
 *  In 3D Plateau allows 4 phases only at isolated points (tetrahedral
 *  vertices); a component that is long in one direction is a 4-fold LINE
 *  (non-physical). In 2D, 3 phases at points only; 4 phases is non-physical. */
export function junctionCensus(sim, lab = null) {
  const { NX, NY, NZ, n, ox, oy, oz } = sim;
  const label = lab ?? componentLabels(sim);
  const d3 = NZ > 1;
  const hist = {};
  const hi = [];
  const set = new Set();
  // label is per component (see componentLabels)
  for (let k = d3 ? 1 : 0; k < (d3 ? NZ : 1); k++) for (let j = 1; j < NY; j++) for (let i = 1; i < NX; i++) {
    set.clear();
    for (let dk = 0; dk < (d3 ? 2 : 1); dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      set.add(label[((k - dk) * NY + (j - dj)) * NX + (i - di)]);
    }
    const m = set.size;
    hist[m] = (hist[m] ?? 0) + 1;
    if (m >= 4) hi.push({ i, j, k, labs: [...set].sort((x, y) => x - y).join(',') });
  }
  // components of >=4 corners (26-connected)
  const key = (a) => `${a.i},${a.j},${a.k}`;
  const idx = new Map(hi.map((a, t) => [key(a), t]));
  const comp = new Int32Array(hi.length).fill(-1);
  const comps = [];
  for (let t = 0; t < hi.length; t++) {
    if (comp[t] >= 0) continue;
    const cid = comps.length;
    const q = [t]; comp[t] = cid;
    const C = { corners: 0, labs: new Set(), lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    while (q.length) {
      const u = hi[q.pop()];
      C.corners++; u.labs.split(',').forEach((x) => C.labs.add(+x));
      const p = [u.i, u.j, u.k];
      for (let a = 0; a < 3; a++) { C.lo[a] = Math.min(C.lo[a], p[a]); C.hi[a] = Math.max(C.hi[a], p[a]); }
      for (let dk = d3 ? -1 : 0; dk <= (d3 ? 1 : 0); dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const v = idx.get(`${u.i + di},${u.j + dj},${u.k + dk}`);
        if (v !== undefined && comp[v] < 0) { comp[v] = cid; q.push(v); }
      }
    }
    comps.push(C);
  }
  const org = [ox, oy, oz];
  return {
    hist,
    quad: comps.map((C) => ({
      corners: C.corners, phases: [...C.labs].sort((x, y) => x - y),
      extent: +(Math.max(...C.hi.map((v, a) => v - C.lo[a])) / n).toFixed(3),
      at: C.lo.map((v, a) => +(org[a] + (0.5 * (v + C.hi[a])) / n).toFixed(3)),
    })).sort((x, y) => y.extent - x.extent),
  };
}

/** A 2D label image: the sim itself in 2D, or an axis-aligned slice of a 3D
 *  sim through the cell layer containing coordinate `at`. Pixel (u, v) has
 *  centre (u0 + (u + .5) h, v0 + (v + .5) h) in the two in-plane axes. */
export function labelImage(sim, axis = 2, at = 0) {
  const { NX, NY, NZ, n, ox, oy, oz, label } = sim;
  if (NZ === 1) return { w: NX, h: NY, lab: label, h0: 1 / n, u0: ox, v0: oy, axes: [0, 1] };
  const dims = [NX, NY, NZ], org = [ox, oy, oz];
  const ua = axis === 0 ? 1 : 0, va = axis === 2 ? 1 : 2;
  const layer = Math.min(dims[axis] - 1, Math.max(0, Math.floor((at - org[axis]) * n)));
  const w = dims[ua], h = dims[va];
  const lab = new Uint8Array(w * h);
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    const ijk = [0, 0, 0]; ijk[axis] = layer; ijk[ua] = u; ijk[va] = v;
    lab[v * w + u] = label[(ijk[2] * NY + ijk[1]) * NX + ijk[0]];
  }
  return { w, h, lab, h0: 1 / n, u0: org[ua], v0: org[va], axes: [ua, va], layerAt: org[axis] + (layer + 0.5) / n };
}

/** Triple (and higher) points of a 2D label image: pixel corners where 3+
 *  labels meet, clustered within `rad` px. */
export function junctions2D(img, rad = 3) {
  const { w, h, lab, h0, u0, v0 } = img;
  const raw = [];
  for (let v = 1; v < h; v++) for (let u = 1; u < w; u++) {
    const s = new Set([lab[v * w + u], lab[v * w + u - 1], lab[(v - 1) * w + u], lab[(v - 1) * w + u - 1]]);
    if (s.size >= 3) raw.push({ u, v, s });
  }
  const cl = [];
  for (const r of raw) {
    let hit = cl.find((c) => Math.abs(c.u / c.k - r.u) <= rad && Math.abs(c.v / c.k - r.v) <= rad);
    if (!hit) { hit = { u: 0, v: 0, k: 0, labs: new Set(), four: 0 }; cl.push(hit); }
    hit.u += r.u; hit.v += r.v; hit.k++; r.s.forEach((x) => hit.labs.add(x));
    if (r.s.size >= 4) hit.four++;
  }
  return cl.map((c) => ({ x: u0 + (c.u / c.k) * h0, y: v0 + (c.v / c.k) * h0, labs: [...c.labs].sort((a, b) => a - b), corners: c.k, fourCorners: c.four }));
}

/** Interface points (edge midpoints) between labels a and b of a 2D image. */
export function interface2D(img, a, b) {
  const { w, h, lab, h0, u0, v0 } = img;
  const out = [];
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    const l = lab[v * w + u];
    if (u + 1 < w) { const r = lab[v * w + u + 1]; if ((l === a && r === b) || (l === b && r === a)) out.push([u0 + (u + 1) * h0, v0 + (v + 0.5) * h0]); }
    if (v + 1 < h) { const r = lab[(v + 1) * w + u]; if ((l === a && r === b) || (l === b && r === a)) out.push([u0 + (u + 0.5) * h0, v0 + (v + 1) * h0]); }
  }
  return out;
}

/** Fit a curve (circle, or line when nearly straight) to 2D points. */
function fitCurve2(pts) {
  const c = fitSphere(pts, 2);
  // line fit (PCA)
  const m = [0, 0];
  for (const p of pts) { m[0] += p[0] / pts.length; m[1] += p[1] / pts.length; }
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { const dx = p[0] - m[0], dy = p[1] - m[1]; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dir = [Math.cos(th), Math.sin(th)];
  let lrms = 0;
  for (const p of pts) { const e = -(p[0] - m[0]) * dir[1] + (p[1] - m[1]) * dir[0]; lrms += e * e; }
  lrms = Math.sqrt(lrms / pts.length);
  if (!isFinite(c.r) || c.r > 30 || c.rms >= lrms * 0.98) return { kind: 'line', m, dir, rms: lrms };
  return { kind: 'circle', c: c.c, r: c.r, rms: c.rms };
}
const closestOn = (f, p) => {
  if (f.kind === 'line') { const t = (p[0] - f.m[0]) * f.dir[0] + (p[1] - f.m[1]) * f.dir[1]; return [f.m[0] + t * f.dir[0], f.m[1] + t * f.dir[1]]; }
  const dx = p[0] - f.c[0], dy = p[1] - f.c[1], l = Math.hypot(dx, dy);
  return [f.c[0] + (dx / l) * f.r, f.c[1] + (dy / l) * f.r];
};
const tangentAt = (f, q) => (f.kind === 'line' ? f.dir.slice() : [-(q[1] - f.c[1]) / f.r, (q[0] - f.c[0]) / f.r]);

/** Angles at a triple point J of a 2D label image. Each film (pair of the
 *  three labels) is fitted near J (points within rIn..rOut blocks) by a
 *  circle or line; the junction is re-estimated as the point closest to all
 *  three curves; tangents there, oriented toward each film's points, give
 *  the three angles. Returns angles keyed by the label filling the sector. */
export function anglesAt(img, J, { rIn = 0.0, rOut = 0.35 } = {}) {
  if (J.labs.length !== 3) return null;
  const [a, b, c] = J.labs;
  const films = [[a, b, c], [b, c, a], [a, c, b]].map(([p, q, opp]) => {
    const pts = interface2D(img, p, q).filter((t) => { const d = Math.hypot(t[0] - J.x, t[1] - J.y); return d >= rIn && d <= rOut; });
    return { p, q, opp, pts };
  });
  if (films.some((f) => f.pts.length < 5)) return { error: 'too few points', counts: films.map((f) => f.pts.length) };
  for (const f of films) f.fit = fitCurve2(f.pts);
  // junction: average of projections, iterated
  let P = [J.x, J.y];
  for (let it = 0; it < 50; it++) {
    const qs = films.map((f) => closestOn(f.fit, P));
    P = [qs.reduce((s, q) => s + q[0], 0) / 3, qs.reduce((s, q) => s + q[1], 0) / 3];
  }
  const miss = Math.max(...films.map((f) => { const q = closestOn(f.fit, P); return Math.hypot(q[0] - P[0], q[1] - P[1]); }));
  const dirs = films.map((f) => {
    const q = closestOn(f.fit, P);
    let t = tangentAt(f.fit, q);
    const mx = f.pts.reduce((s, p) => s + p[0], 0) / f.pts.length - q[0], my = f.pts.reduce((s, p) => s + p[1], 0) / f.pts.length - q[1];
    if (t[0] * mx + t[1] * my < 0) t = [-t[0], -t[1]];
    return { film: `${f.p}|${f.q}`, opp: f.opp, ang: Math.atan2(t[1], t[0]), fit: f.fit.kind, r: f.fit.r, rms: f.fit.rms, n: f.pts.length };
  });
  // the sector opposite film (p|q) is filled by 'opp'; angle between the two other films
  const deg = (x) => (x * 180) / Math.PI;
  const sectors = {};
  for (const d of dirs) {
    const others = dirs.filter((e) => e !== d);
    let da = Math.abs(others[0].ang - others[1].ang);
    if (da > Math.PI) da = 2 * Math.PI - da;
    sectors[d.opp] = +deg(da).toFixed(2);
  }
  return { at: P.map((v) => +v.toFixed(4)), miss: +miss.toFixed(4), sectors, films: dirs.map((d) => ({ film: d.film, fit: d.fit, r: d.r && +d.r.toFixed(3), rms: +d.rms.toFixed(4), n: d.n })) };
}
