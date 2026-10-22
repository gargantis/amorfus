// Error metrics between two smooth fields on one grid (block coordinates).
//  - surface distance: D = 0 points found along random lines on each surface;
//    each point's distance to the other surface is measured along the other
//    field's normal (search +-1 block for the nearest sign change, then
//    bisection). Symmetric stats; points with no crossing within 1 block are
//    "unmatched" (a feature present in one and absent in the other).
//  - seam distance: points inside solid (D > 0.02 on both sides) where the
//    owning material changes; distance to the other field's seam between the
//    same two materials, measured along the other field's seam normal.
//  - signed bias: mean over reference points of the model's signed offset
//    (+ = model surface lies outside the reference, i.e. model bigger).
import { sampleGrid } from '../../../lib/mbo.mjs';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function blockBounds(blocks) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of blocks) for (let t = 0; t < 3; t++) { min[t] = Math.min(min[t], b[t]); max[t] = Math.max(max[t], b[t] + 1); }
  return { min, max };
}

export function lineSet(blocks, count = 400, seed = 7) {
  const r = rng(seed);
  const { min, max } = blockBounds(blocks);
  const lo = min.map((v) => v - 0.4), hi = max.map((v) => v + 0.4);
  const half = 0.5 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) + 0.3;
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = lo.map((v, t) => v + r() * (hi[t] - v));
    const z = 2 * r() - 1, ph = 2 * Math.PI * r(), s = Math.sqrt(1 - z * z);
    const d = [s * Math.cos(ph), z, s * Math.sin(ph)];
    out.push({ p, d, T: half });
  }
  return out;
}

/** A field view: D sampler and owning-material function. */
export function fieldView(grid, D, Cm) {
  const mats = [...Cm.keys()];
  const Ds = (x) => sampleGrid(grid, D, x[0], x[1], x[2]);
  const C = (m, x) => sampleGrid(grid, Cm.get(m), x[0], x[1], x[2]);
  const owner = (x) => { let bm = 0, bv = Infinity; for (const m of mats) { const v = C(m, x); if (v < bv) { bv = v; bm = m; } } return bm; };
  const grad = (f, x, e = 0.02) => [
    (f([x[0] + e, x[1], x[2]]) - f([x[0] - e, x[1], x[2]])) / (2 * e),
    (f([x[0], x[1] + e, x[2]]) - f([x[0], x[1] - e, x[2]])) / (2 * e),
    (f([x[0], x[1], x[2] + e]) - f([x[0], x[1], x[2] - e])) / (2 * e)];
  return { grid, D: Ds, C, owner, grad, mats };
}

const at = (l, t) => [l.p[0] + l.d[0] * t, l.p[1] + l.d[1] * t, l.p[2] + l.d[2] * t];

/** zero crossings of f along line l */
function crossings(f, l, step = 0.01) {
  const out = [];
  let prevT = -l.T, prev = f(at(l, prevT));
  for (let t = -l.T + step; t <= l.T; t += step) {
    const v = f(at(l, t));
    if ((v > 0) !== (prev > 0)) {
      let a = prevT, b = t, fa = prev;
      for (let i = 0; i < 25; i++) { const m = 0.5 * (a + b); const fm = f(at(l, m)); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; }
      out.push(at(l, 0.5 * (a + b)));
    }
    prevT = t; prev = v;
  }
  return out;
}

/** distance from x to the zero set of f, searched along unit direction n */
function distAlong(f, x, n, maxd = 1, step = 0.005) {
  const f0 = f(x);
  if (f0 === 0) return 0;
  for (let s = step; s <= maxd + 1e-9; s += step) {
    for (const sg of [1, -1]) {
      const y = [x[0] + n[0] * s * sg, x[1] + n[1] * s * sg, x[2] + n[2] * s * sg];
      if ((f(y) > 0) !== (f0 > 0)) {
        let a = s - step, b = s;
        for (let i = 0; i < 20; i++) {
          const m = 0.5 * (a + b);
          const ym = [x[0] + n[0] * m * sg, x[1] + n[1] * m * sg, x[2] + n[2] * m * sg];
          if ((f(ym) > 0) === (f0 > 0)) a = m; else b = m;
        }
        return 0.5 * (a + b);
      }
    }
  }
  return null;
}

const unit = (g) => { const l = Math.hypot(g[0], g[1], g[2]); return l > 1e-9 ? g.map((v) => v / l) : null; };

function stats(arr) {
  if (!arr.length) return { n: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, mean: +mean.toFixed(4), rms: +Math.sqrt(s.reduce((a, b) => a + b * b, 0) / s.length).toFixed(4), p95: +s[Math.min(s.length - 1, Math.floor(0.95 * s.length))].toFixed(4), max: +s[s.length - 1].toFixed(4) };
}

export function compareSurfaces(ref, mod, lines) {
  const dists = [], signed = [];
  let unmatched = 0, total = 0;
  for (const [A, Bv, isRef] of [[ref, mod, true], [mod, ref, false]]) {
    for (const l of lines) {
      for (const x of crossings(A.D, l)) {
        total++;
        const nB = unit(Bv.grad(Bv.D, x)) ?? unit(A.grad(A.D, x));
        if (!nB) { unmatched++; continue; }
        const d = distAlong(Bv.D, x, nB);
        if (d === null) { unmatched++; dists.push(1); continue; }
        dists.push(d);
        if (isRef) signed.push(Bv.D(x) > 0 ? d : -d); // model solid at a reference surface point -> model bigger
      }
    }
  }
  const st = stats(dists);
  return { ...st, unmatched, unmatchedFrac: +(unmatched / Math.max(1, total)).toFixed(4), bias: +(signed.reduce((a, b) => a + b, 0) / Math.max(1, signed.length)).toFixed(4) };
}

function seamPoints(V, l, step = 0.01) {
  const out = [];
  let prevT = -l.T, prevX = at(l, prevT);
  let prevO = V.D(prevX) > 0.02 ? V.owner(prevX) : 0;
  for (let t = -l.T + step; t <= l.T; t += step) {
    const x = at(l, t);
    const o = V.D(x) > 0.02 ? V.owner(x) : 0;
    if (o && prevO && o !== prevO) {
      const f = (y) => V.C(prevO, y) - V.C(o, y);
      let a = prevT, b = t;
      for (let i = 0; i < 25; i++) { const m = 0.5 * (a + b); if (f(at(l, m)) < 0) a = m; else b = m; }
      out.push({ x: at(l, 0.5 * (a + b)), a: prevO, b: o });
    }
    prevT = t; prevO = o;
  }
  return out;
}

export function compareSeams(ref, mod, lines) {
  const dists = [];
  let unmatched = 0, total = 0;
  for (const [A, Bv] of [[ref, mod], [mod, ref]]) {
    for (const l of lines) {
      for (const s of seamPoints(A, l)) {
        total++;
        if (!Bv.mats.includes(s.a) || !Bv.mats.includes(s.b)) { unmatched++; dists.push(1); continue; }
        const f = (y) => Bv.C(s.a, y) - Bv.C(s.b, y);
        const nB = unit(Bv.grad(f, s.x)) ?? unit(A.grad((y) => A.C(s.a, y) - A.C(s.b, y), s.x));
        if (!nB) { unmatched++; continue; }
        const d = distAlong(f, s.x, nB);
        if (d === null) { unmatched++; dists.push(1); continue; }
        dists.push(d);
      }
    }
  }
  return { ...stats(dists), unmatched, total };
}
