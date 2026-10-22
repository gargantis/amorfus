// 3D checker cases: final-state X-line census (2x2 sub-cell windows holding 4
// distinct phases, per axis plane; prior's xCount, re-implemented) and per-layer
// connectivity of each material across the junction (look's L9 test).
// node checker3d.mjs <sq2-checker|cube2-checker> <variants>
import { writeFileSync } from 'node:fs';
import { byName } from '../../lib/configs.mjs';
import { runEngine, phaseSummary } from './vu.mjs';
const [name, varA] = process.argv.slice(2);
const blocks = byName(name).blocks;
function xCount(sim) {
  const { NX, NY, NZ, label } = sim; let c = [0, 0, 0];
  const L = (i, j, k) => label[(k * NY + j) * NX + i];
  const four = (a, b, d, e) => a && b && d && e && a !== b && a !== d && a !== e && b !== d && b !== e && d !== e;
  for (let k = 0; k + 1 < NZ; k++) for (let j = 0; j + 1 < NY; j++) for (let i = 0; i + 1 < NX; i++) {
    if (four(L(i, j, k), L(i + 1, j, k), L(i, j + 1, k), L(i + 1, j + 1, k))) c[2]++; // line along z
    if (four(L(i, j, k), L(i + 1, j, k), L(i, j, k + 1), L(i + 1, j, k + 1))) c[1]++; // along y
    if (four(L(i, j, k), L(i, j + 1, k), L(i, j, k + 1), L(i, j + 1, k + 1))) c[0]++; // along x
  }
  return c;
}
// in the horizontal slab of sub-cell rows j (y), is material m connected (2D, within the slab layer) between two points?
function layerConn(sim, m, p0, p1, j) {
  const { NX, NY, NZ, n, ox, oz, label, phases } = sim;
  const idx = (x, z) => (Math.floor((z - oz) * n) * NY + j) * NX + Math.floor((x - ox) * n);
  const isM = (c) => label[c] && phases[label[c]].mat === m;
  const s = idx(...p0), t = idx(...p1);
  if (!isM(s) || !isM(t)) return false;
  const seen = new Uint8Array(NX * NZ); const st = [s]; seen[(Math.floor(s / (NX * NY))) * NX + (s % NX)] = 1;
  while (st.length) {
    const c = st.pop(); if (c === t) return true;
    const i = c % NX, k = Math.floor(c / (NX * NY));
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= NX || kk >= NZ) continue;
      const q = (kk * NY + j) * NX + ii; if (seen[kk * NX + ii] || !isM(q)) continue; seen[kk * NX + ii] = 1; st.push(q);
    }
  }
  return false;
}
const out = { name, runs: [] };
for (const v of varA.split(',')) {
  const opts = { n: 16, maxSteps: 300 }; let run = {};
  if (v === 'j0') opts.jitter = 0;
  else if (v.startsWith('annNM')) { opts.seed = +v.slice(5); run = { anneal: { amp: 0.1, steps: 100, noMerge: true }, quenchSteps: 250 }; }
  else { opts.jitter = 1e-3; opts.seed = +v.slice(1); }
  const sim = runEngine(blocks, opts, run);
  const xc = xCount(sim).map((c) => +(c / sim.n).toFixed(3));
  const layers = [];
  if (name === 'sq2-checker') for (let j = 0; j < sim.NY; j++) {
    const y = sim.oy + (j + 0.5) / sim.n;
    const a = layerConn(sim, 6, [0.5, 0.5], [1.5, 1.5], j), b = layerConn(sim, 7, [1.5, 0.5], [0.5, 1.5], j);
    if (a || b) layers.push(`${y.toFixed(2)}:${a ? 'A' : ''}${b ? 'B' : ''}`);
  }
  const ph = phaseSummary(sim);
  const rec = { v, steps: sim.steps, converged: !!sim.converged, xLineBlocks: xc, phases: ph.map((p) => `${p.mat}:${p.blocks}${p.pieces > 1 ? `[${p.pieces}pc]` : ''}`).join(' '), merges: sim.mergeLog.map((m) => m.t), layers: layers.join(' ') };
  out.runs.push(rec); console.log(JSON.stringify(rec));
  writeFileSync(new URL(`./e3d/${name}-census.json`, import.meta.url), JSON.stringify(out, null, 1));
}
