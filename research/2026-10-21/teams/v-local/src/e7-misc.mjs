// E7: independent checks of fast C1 (one engine step = sum of per-block
// separable kernels) on configurations outside t1's list, C3 (threshold-1/2
// shrink fractions) by independent quadrature, and C14 (diagonal neck).
//   node e7-misc.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { setup, step, gaussKernel, DEFAULTS, clusters, simulate, sampleGrid } from '../../../lib/mbo.mjs';
import { byName } from '../../../lib/configs.mjs';
import { model, Dat, wideHost, bar, r4 } from './common.mjs';
import { newConfigs } from './scenes.mjs';
import { solidRun } from './measure.mjs';

const [out] = process.argv.slice(2);
const res = {};

// ---- C1 ----
// my own continuum box profile: Simpson integral of the Gaussian density
function boxProfile(sigma) {
  const phi = (s) => Math.exp(-s * s / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
  return (t) => { const a = t - 0.5, b = t + 0.5, m = 2000, h = (b - a) / m; let s = phi(a) + phi(b); for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * phi(a + i * h); return s * h / 3; };
}
res.C1 = {};
const cfgs = { 'wide+bar': [...wideHost(), ...bar(6)], ...Object.fromEntries(newConfigs().filter((c) => ['terrain-a', 'overhang', 'grass-terrace'].includes(c.name)).map((c) => [c.name, c.blocks])) };
for (const [name, blocks] of Object.entries(cfgs)) {
  const n = 12;
  const o = { ...DEFAULTS, n, s: 0.2 * n, merge: false, volume: true };
  const sim = setup(blocks, o);
  const ker = gaussKernel(o.s);
  step(sim, o, ker);
  const { phaseOfBlock } = clusters(blocks, 3);
  const { k: dk, R } = ker;
  const prof = boxProfile(0.2);
  let maxDisc = 0, maxCont = 0, cells = 0;
  for (let p = 1; p < sim.phases.length; p++) {
    const P = sim.phases[p];
    if (!P.u) continue;
    const bl = blocks.filter((_, i) => phaseOfBlock[i] === p);
    const [i0, j0, k0, i1, j1, k1] = P.box;
    const w = i1 - i0 + 1, h = j1 - j0 + 1, d = k1 - k0 + 1;
    // per-axis discrete and continuum profiles per block
    const disc = (cell, b0) => { let s = 0; for (let j = b0; j < b0 + n; j++) { const q = cell - j; if (q >= -R && q <= R) s += dk[q + R]; } return s; };
    // the engine blurs the step-0 labels, i.e. the blocks
    for (let k = 0; k < d; k += 2) for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) {
      let sd = 0, sc = 0;
      const ci = i0 + i, cj = j0 + j, ck = k0 + k;
      const x = sim.ox + (ci + 0.5) / n, y = sim.oy + (cj + 0.5) / n, z = sim.oz + (ck + 0.5) / n;
      for (const b of bl) {
        const bx0 = Math.round((b[0] - sim.ox) * n), by0 = Math.round((b[1] - sim.oy) * n), bz0 = Math.round((b[2] - sim.oz) * n);
        if (Math.abs(ci - bx0 - n / 2) > R + n || Math.abs(cj - by0 - n / 2) > R + n || Math.abs(ck - bz0 - n / 2) > R + n) continue;
        sd += disc(ci, bx0) * disc(cj, by0) * disc(ck, bz0);
        sc += prof(x - b[0] - 0.5) * prof(y - b[1] - 0.5) * prof(z - b[2] - 0.5);
      }
      const u = P.u[(k * h + j) * w + i];
      maxDisc = Math.max(maxDisc, Math.abs(u - sd)); maxCont = Math.max(maxCont, Math.abs(u - sc));
      cells++;
    }
  }
  res.C1[name] = { n, cellsChecked: cells, maxAbs_engine_vs_discreteSum: +maxDisc.toExponential(2), maxAbs_engine_vs_continuumSum: +maxCont.toExponential(3) };
  console.log('C1', name, JSON.stringify(res.C1[name]));
}

// ---- C3: volume fraction of {u > 1/2}, u separable for box-shaped clusters ----
function fraction(sigma, ext, h = 1 / 200) {
  const prof = boxProfile(sigma);
  const axis = (L) => { const xs = [], us = []; for (let x = -0.6 + h / 2; x < L + 0.6; x += h) { xs.push(x); let s = 0; for (let b = 0; b < L; b++) s += prof(x - b - 0.5); us.push(s); } return us; };
  const U = ext.map(axis);
  let cnt = 0;
  for (const a of U[0]) for (const b of U[1]) { const ab = a * b; if (ab <= 0.5) continue; for (const c of U[2]) if (ab * c > 0.5) cnt++; }
  return r4((cnt * h * h * h) / (ext[0] * ext[1] * ext[2]));
}
res.C3 = {};
for (const sigma of [0.2, 0.4]) {
  res.C3[sigma] = { single: fraction(sigma, [1, 1, 1]), pair: fraction(sigma, [2, 1, 1]), line3: fraction(sigma, [3, 1, 1]), sq2: fraction(sigma, [2, 2, 1]), cube2: fraction(sigma, [2, 2, 2]) };
  console.log('C3 sigma', sigma, JSON.stringify(res.C3[sigma]));
}
{ let lo = 0.3, hi = 0.5; for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi); const k0 = boxProfile(m)(0); if (k0 ** 3 > 0.5) lo = m; else hi = m; } res.C3.vanishSigma = r4(0.5 * (lo + hi)); console.log('C3 vanish sigma', res.C3.vanishSigma); }

// ---- C14: diag-edge neck at the shared edge (x = 1, z = 1, y = 0.5) along the anti-diagonal ----
res.C14 = {};
const de = byName('diag-edge').blocks;
const neck = (F) => ({ Dedge: r4(F(1, 0.5, 1)), neck: solidRun((x, y, z) => F(x, y, z), [1, 0.5, 1], 0, 2) });
// anti-diagonal: blocks at (0,0,0) and (1,0,1)? check which diagonal is solid
const solidDir = de.some((b) => b[0] === 0 && b[2] === 0) && de.some((b) => b[0] === 1 && b[2] === 1) ? [1, -1] : [1, 1];
const across = (F) => { const d = [Math.SQRT1_2 * solidDir[0] * -1, 0, Math.SQRT1_2 * solidDir[1] * -1]; const p = [1, 0.5, 1]; if (!(F(...p) > 0)) return 0; let a = 0, b = 0; while (a < 2 && F(p[0] + d[0] * a, p[1], p[2] + d[2] * a) > 0) a += 0.002; while (b < 2 && F(p[0] - d[0] * b, p[1], p[2] - d[2] * b) > 0) b += 0.002; return r4(a + b); };
for (const id of ['A0-g20', 'Bl-b1s20', 'Bl-g20', 'Bx-g20']) { const m = model(de, id, 16); const F = (x, y, z) => Dat(m, x, y, z); res.C14[id] = { Dedge: r4(F(1, 0.5, 1)), neck: across(F) }; }
for (const [reg, opts] of [['FID-0.15', { anchor: { kind: 'fidelity', k: 0.15 } }], ['FINITE-4', { maxSteps: 4, stopAfter: 99 }]]) {
  const sim = simulate(de, { ...opts, n: 16 });
  const I = new Float32Array(sim.N); for (let c = 0; c < sim.N; c++) I[c] = sim.label[c] ? 1 : 0;
  const lab = (x, y, z) => sampleGrid(sim, I, x, y, z) - 0.5, D = (x, y, z) => sampleGrid(sim, sim.D, x, y, z);
  res.C14[reg] = { labels: { Dedge: r4(lab(1, 0.5, 1)), neck: across(lab) }, D: { Dedge: r4(D(1, 0.5, 1)), neck: across(D) }, phasesAlive: sim.phases.filter((P, p) => p && P.alive).length };
}
console.log('C14', JSON.stringify(res.C14), 'solidDir', solidDir);
void neck;
writeFileSync(out, JSON.stringify(res, null, 1));
