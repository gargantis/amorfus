// Team "local" helpers: regimes, runs on a shared grid, difference fields.
// Uses lib/mbo-box.mjs (a copy of ../../../lib/mbo.mjs with two patches:
// an optional `bbox` so base and perturbed runs share one grid, and
// `lamRun` = the dynamics lambda recorded before finish() re-solves it).
import { simulate, sampleGrid, samplePhase, volumes } from './mbo-box.mjs';

export const REG = {
  'FID-0.15': { anchor: { kind: 'fidelity', k: 0.15 }, maxSteps: 300 },
  'FID-0.05': { anchor: { kind: 'fidelity', k: 0.05 }, maxSteps: 300 },
  'FINITE-4': { maxSteps: 4, stopAfter: 99 },
  'CAGE-0.25': { anchor: { kind: 'cage', r: 0.25 }, maxSteps: 300 },
  'FREE': { maxSteps: 400 },
  // controls: same, without the volume constraint (no bubble pressure)
  'FID-0.15-novol': { anchor: { kind: 'fidelity', k: 0.15 }, maxSteps: 300, volume: false },
  'FID-0.05-novol': { anchor: { kind: 'fidelity', k: 0.05 }, maxSteps: 300, volume: false },
  'FINITE-4-novol': { maxSteps: 4, stopAfter: 99, volume: false },
  'CAGE-0.25-novol': { anchor: { kind: 'cage', r: 0.25 }, maxSteps: 300, volume: false },
};

export function bboxOf(blockLists) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const L of blockLists) for (const [x, y, z] of L) {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.min(b[2], z);
    b[3] = Math.max(b[3], x); b[4] = Math.max(b[4], y); b[5] = Math.max(b[5], z);
  }
  return b;
}

export function runSim(blocks, regName, extra = {}) {
  const t0 = performance.now();
  const opts = { ...REG[regName], ...extra };
  const sim = simulate(blocks, opts);
  sim.ms = Math.round(performance.now() - t0);
  sim.regName = regName;
  return sim;
}

export function phaseSummary(sim) {
  return volumes(sim).map((v) => ({ p: v.p, mat: v.mat, blocks: v.blocks, volume: +v.volume.toFixed(3),
    lamRun: +(sim.phases[v.p].lamRun ?? NaN).toFixed(5), lamRender: +sim.phases[v.p].lambda.toFixed(5) }));
}

export function simInfo(sim) {
  return { regime: sim.regName, ms: sim.ms, steps: sim.steps, converged: !!sim.converged,
    lastChanges: sim.history.slice(-4), grid: [sim.NX, sim.NY, sim.NZ], n: sim.n, phases: phaseSummary(sim) };
}

/** Material per cell (0 = air). */
export function matGrid(sim) {
  const m = new Uint8Array(sim.N);
  for (let c = 0; c < sim.N; c++) m[c] = sim.label[c] ? sim.phases[sim.label[c]].mat : 0;
  return m;
}

export function cellCentre(sim, c) {
  const { NX, NY, n, ox, oy, oz, NZ } = sim;
  const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
  return [ox + (i + 0.5) / n, oy + (j + 0.5) / n, NZ > 1 ? oz + (k + 0.5) / n : 0.5];
}

/** Euclidean distance from point p to an axis box [x0,y0,z0,x1,y1,z1] (block coords). */
export function distToBox(p, b, dims = 3) {
  const dx = Math.max(b[0] - p[0], 0, p[0] - b[3]);
  const dy = Math.max(b[1] - p[1], 0, p[1] - b[4]);
  const dz = dims === 3 ? Math.max(b[2] - p[2], 0, p[2] - b[5]) : 0;
  return Math.hypot(dx, dy, dz);
}

/** Cells whose material differs between two sims on the same grid, binned by
 *  distance from `box` (the perturbed block). Returns {count, maxDist, bins}. */
export function labelDiff(a, b, box, binW = 0.25) {
  if (a.N !== b.N || a.NX !== b.NX) throw new Error('grids differ');
  const ma = matGrid(a), mb = matGrid(b);
  let count = 0, maxDist = 0;
  const bins = {};
  const far = [];
  for (let c = 0; c < a.N; c++) {
    if (ma[c] === mb[c]) continue;
    count++;
    const d = distToBox(cellCentre(a, c), box, a.dims);
    maxDist = Math.max(maxDist, d);
    const k = (Math.floor(d / binW) * binW).toFixed(2);
    bins[k] = (bins[k] ?? 0) + 1;
    if (d > 1.5 && far.length < 40) far.push({ at: cellCentre(a, c).map((v) => +v.toFixed(3)), from: ma[c], to: mb[c], d: +d.toFixed(2) });
  }
  return { count, maxDist: +maxDist.toFixed(3), bins, far };
}

/** Cost of the cheapest live phase of material `mat` at a point (BIG if none). */
export function matCost(sim, mat, x, y, z) {
  let best = 9;
  for (let p = 1; p < sim.phases.length; p++) {
    const P = sim.phases[p];
    if (!P.alive || P.mat !== mat) continue;
    const v = samplePhase(sim, p, x, y, z);
    if (v < best) best = v;
  }
  return best;
}

/** Surface-displacement field (smooth field D): at every base surface cell
 *  (D changes sign to a face neighbour), delta = D_pert / |grad D_base|,
 *  the outward normal shift, valid for small shifts. Also the label shift
 *  is reported separately by labelDiff. Returns per-distance-bin max |delta|
 *  and a list of samples (distance, delta). */
export function surfaceShift(base, pert, box, { binW = 0.25, exclude = null } = {}) {
  const { NX, NY, NZ, n } = base;
  const Db = base.D, Dp = pert.D;
  const bins = {};
  const samples = [];
  const st = NZ > 1 ? [1, NX, NX * NY] : [1, NX];
  for (let c = 0; c < base.N; c++) {
    const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
    if (i < 1 || j < 1 || i > NX - 2 || j > NY - 2 || (NZ > 1 && (k < 1 || k > NZ - 2))) continue;
    const s0 = Db[c] > 0;
    let surf = false;
    for (const s of st) if ((Db[c + s] > 0) !== s0) { surf = true; break; }
    if (!surf) continue;
    // gradient (per block) by central differences
    const gx = (Db[c + 1] - Db[c - 1]) * n / 2, gy = (Db[c + NX] - Db[c - NX]) * n / 2;
    const gz = NZ > 1 ? (Db[c + NX * NY] - Db[c - NX * NY]) * n / 2 : 0;
    const g = Math.hypot(gx, gy, gz);
    if (g < 1e-3) continue;
    // shift of the zero level: base value Db[c] is not exactly 0 at a cell
    // centre, so compare the two fields' zero-level offsets at this cell
    const delta = (Dp[c] - Db[c]) / g;
    const p = cellCentre(base, c);
    if (exclude && exclude(p)) continue;
    const d = distToBox(p, box, base.dims);
    const key = (Math.floor(d / binW) * binW).toFixed(2);
    const a = Math.abs(delta);
    if (!bins[key] || a > bins[key].max) bins[key] = { max: +a.toExponential(3), at: p.map((v) => +v.toFixed(3)), signed: +delta.toExponential(3) };
    samples.push([d, delta]);
  }
  return { bins, samples };
}

/** Top surface height above (x, z) from the smooth field (ray down). */
export function topD(sim, x, z, yTop, yBot, step = 0.004) {
  const D = (y) => sampleGrid(sim, sim.D, x, y, z);
  let prev = yTop;
  if (D(yTop) > 0) return null;
  for (let y = yTop - step; y >= yBot; y -= step) {
    if (D(y) > 0) {
      let a = y, b = prev; // a solid, b air
      for (let i = 0; i < 40; i++) { const m = 0.5 * (a + b); if (D(m) > 0) a = m; else b = m; }
      return 0.5 * (a + b);
    }
    prev = y;
  }
  return null;
}

/** Top height from labels: top of the highest solid cell in the column. */
export function topLabel(sim, x, z) {
  const { NX, NY, n, ox, oy, oz, NZ, label } = sim;
  const i = Math.floor((x - ox) * n), k = NZ > 1 ? Math.floor((z - oz) * n) : 0;
  for (let j = NY - 1; j >= 0; j--) if (label[(k * NY + j) * NX + i]) return oy + (j + 1) / n;
  return null;
}

/** Seam (A|B boundary) position along a horizontal line in direction `axis`
 *  (0 = x, 2 = z) through (fixed other coords), from the cost fields: the
 *  zero of matCost(A) - matCost(B) between lo and hi. Only inside solid. */
export function seamD(sim, A, B, pt, axis, lo, hi, step = 0.004) {
  const at = (t) => { const p = pt.slice(); p[axis] = t; return p; };
  const F = (t) => { const p = at(t); return matCost(sim, A, ...p) - matCost(sim, B, ...p); };
  let prev = lo, fp = F(lo);
  for (let t = lo + step; t <= hi; t += step) {
    const f = F(t);
    if ((f > 0) !== (fp > 0)) {
      let a = prev, b = t;
      for (let i = 0; i < 40; i++) { const m = 0.5 * (a + b); if ((F(m) > 0) === (fp > 0)) a = m; else b = m; }
      return 0.5 * (a + b);
    }
    prev = t; fp = f;
  }
  return null;
}

/** Seam from labels: first cell along the line whose material is B after A. */
export function seamLabel(sim, A, B, pt, axis, lo, hi) {
  const { NX, NY, n, ox, oy, oz, NZ, label, phases } = sim;
  const idx = (p) => {
    const i = Math.floor((p[0] - ox) * n), j = Math.floor((p[1] - oy) * n), k = NZ > 1 ? Math.floor((p[2] - oz) * n) : 0;
    return (k * NY + j) * NX + i;
  };
  let prevMat = null;
  for (let t = lo + 0.5 / n; t <= hi; t += 1 / n) {
    const p = pt.slice(); p[axis] = t;
    const L = label[idx(p)], m = L ? phases[L].mat : 0;
    if (prevMat === A && m === B) return t - 0.5 / n;
    if (prevMat === B && m === A) return t - 0.5 / n;
    prevMat = m;
  }
  return null;
}

export const fmt = (v) => (v === null || v === undefined ? null : +v.toFixed(5));

/** All seam crossings (material A <-> B) along a line, from the cost fields. */
export function seamsD(sim, A, B, pt, axis, lo, hi, step = 0.004) {
  const at = (t) => { const p = pt.slice(); p[axis] = t; return p; };
  const F = (t) => { const p = at(t); if (sampleGrid(sim, sim.D, ...p) <= 0) return NaN; return matCost(sim, A, ...p) - matCost(sim, B, ...p); };
  const out = [];
  let prev = lo, fp = F(lo);
  for (let t = lo + step; t <= hi; t += step) {
    const f = F(t);
    if (Number.isFinite(f) && Number.isFinite(fp) && (f > 0) !== (fp > 0)) {
      let a = prev, b = t;
      for (let i = 0; i < 40; i++) { const m = 0.5 * (a + b); if ((F(m) > 0) === (fp > 0)) a = m; else b = m; }
      out.push(+(0.5 * (a + b)).toFixed(5));
    }
    prev = t; fp = f;
  }
  return out;
}
