// Simulation wrapper and per-corner measurement for team 'table'.
// Uses src/mbo-clamp.mjs: lib/mbo.mjs with a clamp-to-edge blur boundary and a bbox option.
import { DEFAULTS, setup, run, finish, sampleGrid, samplePhase } from './mbo-clamp.mjs';
import { bevelOffset } from '../mesher.mjs';

export const REGIMES = {
  'FID-0.15': { anchor: { kind: 'fidelity', k: 0.15 } },
  'FINITE-4': { maxSteps: 4, stopAfter: 99 },
};

/** Run a scene. `group(block) -> key` (optional) pre-merges phases whose
 *  blocks share a key (and a material): 'mat' semantics = key by material,
 *  'world' semantics = key by a cluster id computed on a larger region. */
export function simulateScene(blocks, opts, group = null) {
  const o = { ...DEFAULTS, ...opts };
  const sim = setup(blocks, o);
  sim.opts = o;
  if (group) mergeGroups(sim, blocks, group);
  run(sim, o);
  finish(sim, o);
  return sim;
}

function mergeGroups(sim, blocks, group) {
  const { n, NX, NY, ox, oy, oz, label, orig, phases } = sim;
  const phaseOfKey = new Map();
  const remap = phases.map((_, p) => p);
  for (const b of blocks) {
    const i = Math.round((b[0] + 0.5 - ox) * n - 0.5), j = Math.round((b[1] + 0.5 - oy) * n - 0.5), k = sim.NZ > 1 ? Math.round((b[2] + 0.5 - oz) * n - 0.5) : 0;
    const p = label[(k * NY + j) * NX + i];
    const key = `${b[3]}|${group(b)}`;
    if (!phaseOfKey.has(key)) phaseOfKey.set(key, p);
    const q = phaseOfKey.get(key);
    if (q !== p) remap[p] = q;
  }
  let merged = 0;
  for (let p = 1; p < phases.length; p++) {
    const q = remap[p];
    if (q === p || !phases[p].alive) continue;
    phases[q].target += phases[p].target; phases[q].blocks += phases[p].blocks;
    phases[p].alive = false; sim.root[p] = q; merged++;
  }
  if (merged) for (let c = 0; c < label.length; c++) { label[c] = remap[label[c]]; orig[c] = remap[orig[c]]; }
  sim.premerged = merged;
}

// ---------- geometry helpers ----------
const Dat = (sim, p) => sampleGrid(sim, sim.D, p[0], p[1], p[2]);
function gradD(sim, p) {
  const e = 0.5 / sim.n;
  return [
    (Dat(sim, [p[0] + e, p[1], p[2]]) - Dat(sim, [p[0] - e, p[1], p[2]])) / (2 * e),
    (Dat(sim, [p[0], p[1] + e, p[2]]) - Dat(sim, [p[0], p[1] - e, p[2]])) / (2 * e),
    (Dat(sim, [p[0], p[1], p[2] + e]) - Dat(sim, [p[0], p[1], p[2] - e])) / (2 * e),
  ];
}
/** Newton projection onto D = 0; returns { p, ok, dist }. */
export function project(sim, p0, iters = 8) {
  let p = p0.slice();
  for (let it = 0; it < iters; it++) {
    const d = Dat(sim, p);
    const g = gradD(sim, p);
    const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    if (g2 < 1e-10) break;
    let s = d / g2;
    const stepLen = Math.abs(s) * Math.sqrt(g2);
    if (stepLen > 0.25) s *= 0.25 / stepLen;
    p = [p[0] - s * g[0], p[1] - s * g[1], p[2] - s * g[2]];
    if (Math.abs(d) < 1e-5) break;
  }
  const res = Math.abs(Dat(sim, p));
  const g = gradD(sim, p);
  const gl = Math.hypot(...g) || 1;
  return { p, ok: res / gl < 2e-3, dist: Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]) };
}

/** Candidate solid phases near a point (from labels in a box). */
function phasesNear(sim, c, R) {
  const { n, NX, NY, NZ, ox, oy, oz, label, phases } = sim;
  const set = new Set();
  const i0 = Math.max(0, Math.floor((c[0] - R - ox) * n)), i1 = Math.min(NX - 1, Math.ceil((c[0] + R - ox) * n));
  const j0 = Math.max(0, Math.floor((c[1] - R - oy) * n)), j1 = Math.min(NY - 1, Math.ceil((c[1] + R - oy) * n));
  const k0 = Math.max(0, Math.floor((c[2] - R - oz) * n)), k1 = Math.min(NZ - 1, Math.ceil((c[2] + R - oz) * n));
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const p = label[(k * NY + j) * NX + i];
    if (p) set.add(p);
  }
  return [...set].filter((p) => phases[p].alive);
}

const OCT = [];
for (let b = 0; b < 8; b++) OCT.push([b & 1, (b >> 2) & 1, (b >> 1) & 1]);
const EDGES = [];
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) { const b = a ^ bit; if (b > a) EDGES.push([a, b]); }

/** Measure the surface around lattice corner C = [X, Y, Z]. lab8 = block
 *  materials (b order). Offsets are relative to C. Returns
 *  { vsn, vmat: {m: v}, seam: [[x,y,z]...], vseam, nCross, ok, surf } */
export function measureCorner(sim, C, lab8, { h = 1 / 32, R = 0.6 } = {}) {
  const at = (d) => [C[0] + d[0], C[1] + d[1], C[2] + d[2]];
  const crosses = [];
  for (const [a, b] of EDGES) {
    const pa = OCT[a].map((v) => v - 0.5), pb = OCT[b].map((v) => v - 0.5);
    const da = Dat(sim, at(pa)), db = Dat(sim, at(pb));
    if ((da > 0) === (db > 0)) continue;
    // march for every sign change, bisect each
    const pts = [];
    let prevT = 0, prevS = da > 0;
    const M = 32;
    for (let s = 1; s <= M; s++) {
      const t = s / M;
      const q = pa.map((v, i) => v + (pb[i] - v) * t);
      const sg = Dat(sim, at(q)) > 0;
      if (sg !== prevS) {
        let lo = prevT, hi = t;
        for (let it = 0; it < 24; it++) { const m = 0.5 * (lo + hi); const qm = pa.map((v, i) => v + (pb[i] - v) * m); if ((Dat(sim, at(qm)) > 0) === prevS) lo = m; else hi = m; }
        const tm = 0.5 * (lo + hi);
        pts.push(pa.map((v, i) => v + (pb[i] - v) * tm));
        prevS = sg;
      }
      prevT = t;
    }
    if (!pts.length) continue;
    const mean = [0, 1, 2].map((i) => pts.reduce((s, q) => s + q[i], 0) / pts.length);
    const solidEnd = da > 0 ? a : b;
    crosses.push({ p: mean, mat: lab8[solidEnd], multi: pts.length });
  }
  const out = { nCross: crosses.length, ok: crosses.length > 0 };
  if (!crosses.length) return out;
  // grid scan over [-R, R]^3: D samples, the surface cloud (linear zero
  // crossings on grid edges) and seam points (cubes with a D sign change
  // whose solid corners belong to >= 2 materials)
  const nG = Math.round((2 * R) / h) + 1;
  const Dg = new Float32Array(nG * nG * nG);
  const gi = (i, j, k) => (k * nG + j) * nG + i;
  for (let k = 0; k < nG; k++) for (let j = 0; j < nG; j++) for (let i = 0; i < nG; i++) {
    Dg[gi(i, j, k)] = Dat(sim, [C[0] - R + i * h, C[1] - R + j * h, C[2] - R + k * h]);
  }
  const cloud = [];
  for (let k = 0; k < nG; k++) for (let j = 0; j < nG; j++) for (let i = 0; i < nG; i++) {
    const d0 = Dg[gi(i, j, k)];
    for (const [di, dj, dk] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      if (i + di >= nG || j + dj >= nG || k + dk >= nG) continue;
      const d1 = Dg[gi(i + di, j + dj, k + dk)];
      if ((d0 > 0) === (d1 > 0)) continue;
      const t = d0 / (d0 - d1);
      cloud.push(-R + (i + di * t) * h, -R + (j + dj * t) * h, -R + (k + dk * t) * h);
    }
  }
  out.cloud = Float32Array.from(cloud);
  const cloudNearest = (v) => {
    let bd = Infinity, bi = -1;
    for (let q = 0; q < cloud.length; q += 3) { const d = (cloud[q] - v[0]) ** 2 + (cloud[q + 1] - v[1]) ** 2 + (cloud[q + 2] - v[2]) ** 2; if (d < bd) { bd = d; bi = q; } }
    return bi < 0 ? null : { p: [cloud[bi], cloud[bi + 1], cloud[bi + 2]], d: Math.sqrt(bd) };
  };
  const meanOf = (list) => [0, 1, 2].map((i) => list.reduce((s, c) => s + c.p[i], 0) / list.length);
  const clampCell = (v) => v.map((x) => Math.max(-0.5, Math.min(0.5, x)));
  // projection onto D = 0: Newton; where D is flat (clamped at -1 deep in
  // air) start again from the nearest cloud point
  // fallback direction: the occupancy gradient (mean solid centre minus
  // mean air centre), as the bevel table uses
  const gdir = [0, 0, 0];
  { let ns = 0, na = 0; const sc = [0, 0, 0], ac = [0, 0, 0];
    for (let b = 0; b < 8; b++) { const c = OCT[b]; if (lab8[b]) { ns++; for (let t = 0; t < 3; t++) sc[t] += c[t]; } else { na++; for (let t = 0; t < 3; t++) ac[t] += c[t]; } }
    for (let t = 0; t < 3; t++) gdir[t] = sc[t] / ns - ac[t] / na;
    const l = Math.hypot(...gdir); if (l > 1e-9) for (let t = 0; t < 3; t++) gdir[t] /= l; }
  const lineSearch = (v) => {
    if (Math.hypot(...gdir) < 0.5) return null;
    const Dv = (t) => Dat(sim, at(v.map((x, i) => x + gdir[i] * t)));
    const s0 = Dv(0) > 0;
    for (let k = 1; k <= 80; k++) for (const sg of [1, -1]) {
      const t1 = sg * k / 64, t0 = sg * (k - 1) / 64;
      if ((Dv(t1) > 0) !== s0) { let lo = t0, hi = t1; for (let it = 0; it < 30; it++) { const m = 0.5 * (lo + hi); if ((Dv(m) > 0) === s0) lo = m; else hi = m; } const t = 0.5 * (lo + hi); return at(v.map((x, i) => x + gdir[i] * t)); }
    }
    return null;
  };
  const proj = (v) => {
    let r = project(sim, at(v));
    if (!r.ok) {
      const ls = lineSearch(v);
      if (ls) { r = project(sim, ls); if (!r.ok) r = { p: ls, ok: true }; }
      else { const q = cloudNearest(v); if (q) { r = project(sim, at(q.p)); if (!r.ok) r = { p: at(q.p), ok: true }; } }
    }
    return { v: clampCell(r.p.map((x, i) => x - C[i])), ok: r.ok };
  };
  const raw = meanOf(crosses);
  const ps = proj(raw);
  out.vraw = raw; out.vsn = ps.v; out.projOk = ps.ok;
  out.vmat = {};
  for (const m of new Set(crosses.map((c) => c.mat))) { if (m) out.vmat[m] = proj(meanOf(crosses.filter((c) => c.mat === m))).v; }
  const cands = phasesNear(sim, C, R + 0.2);
  const ownCache = new Map();
  const ownerMat = (i, j, k) => {
    const key = gi(i, j, k);
    if (ownCache.has(key)) return ownCache.get(key);
    const p = [C[0] - R + i * h, C[1] - R + j * h, C[2] - R + k * h];
    let best = 0, bv = Infinity;
    for (const q of cands) { const v = samplePhase(sim, q, p[0], p[1], p[2]); if (v < bv) { bv = v; best = q; } }
    const m = best ? sim.phases[best].mat : 0;
    ownCache.set(key, m);
    return m;
  };
  const seam = [];
  for (let k = 0; k < nG - 1; k++) for (let j = 0; j < nG - 1; j++) for (let i = 0; i < nG - 1; i++) {
    let pos = 0, neg = 0;
    for (let c = 0; c < 8; c++) { const v = Dg[gi(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))]; if (v > 0) pos++; else neg++; }
    if (!pos || !neg) continue;
    const mats = new Set();
    for (let c = 0; c < 8; c++) {
      const ii = i + (c & 1), jj = j + ((c >> 1) & 1), kk = k + (c >> 2);
      if (Dg[gi(ii, jj, kk)] > 0) mats.add(ownerMat(ii, jj, kk));
    }
    if (mats.size >= 2) seam.push([-R + (i + 0.5) * h, -R + (j + 0.5) * h, -R + (k + 0.5) * h]);
  }
  out.seam = seam;
  const inCell = seam.filter((q) => q.every((x) => Math.abs(x) <= 0.5));
  out.seamInCell = inCell.length;
  if (inCell.length) {
    let best = null, bd = Infinity;
    for (const q of inCell) { const d = Math.hypot(q[0] - out.vsn[0], q[1] - out.vsn[1], q[2] - out.vsn[2]); if (d < bd) { bd = d; best = q; } }
    out.vseam = proj(best).v;
  }
  out.surfDist = (v) => {
    const r = project(sim, at(v));
    const q = cloudNearest(v);
    const dc = q ? q.d : Infinity;
    return r.ok ? Math.min(r.dist, dc) : dc;
  };
  return out;
}

export function seamDist(meas, v) {
  if (!meas.seam || !meas.seam.length) return NaN;
  let bd = Infinity;
  for (const q of meas.seam) bd = Math.min(bd, Math.hypot(q[0] - v[0], q[1] - v[1], q[2] - v[2]));
  return bd;
}

/** The repo mesher's 'bevel' rule for this corner (§7.9): table offset
 *  capped at 0.25 per axis plus the in-plane seam shift on a flat half
 *  whose 4 solid blocks have exactly one odd material. */
const FLAT = { 0x55: [0, 0], 0xaa: [0, 1], 0x0f: [1, 0], 0xf0: [1, 1], 0x33: [2, 0], 0xcc: [2, 1] };
export function bevelVertex(lab8, cap = 0.25, seam = 0.25) {
  let mask = 0;
  for (let b = 0; b < 8; b++) if (lab8[b]) mask |= 1 << b;
  const d = bevelOffset(mask).map((v) => Math.max(-cap, Math.min(cap, v)));
  const fh = FLAT[mask];
  if (fh && seam > 0) {
    const [axis, half] = fh;
    // the 4 solid blocks indexed (ou, ov) over the tangent axes in x<y<z order
    const tang = [0, 1, 2].filter((t) => t !== axis);
    const blk = (ou, ov) => { const c = [0, 0, 0]; c[axis] = half; c[tang[0]] = ou; c[tang[1]] = ov; return lab8[c[0] | (c[2] << 1) | (c[1] << 2)]; };
    const m = [blk(0, 0), blk(1, 0), blk(0, 1), blk(1, 1)];
    let odd = -1;
    if (m[1] === m[2] && m[2] === m[3] && m[0] !== m[1]) odd = 0;
    else if (m[0] === m[2] && m[2] === m[3] && m[1] !== m[0]) odd = 1;
    else if (m[0] === m[1] && m[1] === m[3] && m[2] !== m[0]) odd = 2;
    else if (m[0] === m[1] && m[1] === m[2] && m[3] !== m[0]) odd = 3;
    if (odd >= 0) {
      d[tang[0]] += (odd & 1) ? seam : -seam;
      d[tang[1]] += (odd & 2) ? seam : -seam;
    }
  }
  return d;
}

export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
