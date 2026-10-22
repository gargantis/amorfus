// Task 1: is one MBO step from the blocks a metaball model?
// For each configuration: run the engine's first step (lib/mbo.mjs `step`,
// merge off so every phase keeps its field) and compare each phase's blurred
// indicator P.u with
//   (i)  the analytic sum over the phase's blocks of K = k(x)k(y)k(z),
//        k = erf box profile, sigma = s/n blocks;
//   (ii) the same sum with the engine's own discrete kernel (sampled,
//        truncated at R = ceil(3s), normalised), evaluated in f64 — this
//        isolates the code path from the discretisation;
// and compare the engine's step-1 labels with the labels obtained from the
// analytic fields through the engine's psi formula and the engine's lambdas.
//   node t1.mjs <outJSON> [n] [names]
import { writeFileSync } from 'node:fs';
import { setup, step, gaussKernel, DEFAULTS } from '../../../lib/mbo.mjs';
import { byName } from '../../../lib/configs.mjs';
import { gauss } from './kern.mjs';

const [out, nArg, namesArg] = process.argv.slice(2);
const n = Number(nArg ?? 16);
const names = (namesArg ?? 'single,pair-same,pair-diff,L3-ABC,sq2-checker,diag-edge,stairs,slab-line,cube2-checker,terrain-step').split(',');
const res = { n, s: 0.2 * n, sigmaBlocks: 0.2, configs: {} };

for (const name of names) {
  const cfg = byName(name);
  const o = { ...DEFAULTS, n, s: 0.2 * n, merge: false, volume: true };
  const sim = setup(cfg.blocks, o);
  const ker = gaussKernel(o.s);
  const t0 = performance.now();
  step(sim, o, ker);
  const msStep = performance.now() - t0;
  const { NX, NY, NZ, ox, oy, oz, phases, label } = sim;
  const sig = o.s / n;
  const K = gauss(sig);
  // engine's discrete kernel, f64
  const { k: dk, R } = ker;
  const disc1 = (cellIdx, b0) => { // sum over the block's n cells [b0, b0+n) of dk[cell - j + R]
    let s = 0;
    for (let j = b0; j < b0 + n; j++) { const d = cellIdx - j; if (d >= -R && d <= R) s += dk[d + R]; }
    return s;
  };
  const mc = Math.round((0 - ox) * n); // not used directly
  // per-phase block lists
  const { phaseOfBlock } = (await import('../../../lib/mbo.mjs')).clusters(cfg.blocks, 3);
  const blocksOf = phases.map(() => []);
  cfg.blocks.forEach((b, i) => blocksOf[phaseOfBlock[i]].push(b));
  let maxErf = 0, maxDisc = 0, sumErf2 = 0, cnt = 0, maxU = 0;
  const uA = new Map(); // analytic (erf) u per phase on the full grid, for labels
  for (let p = 1; p < phases.length; p++) {
    const P = phases[p];
    if (!P.u) continue;
    const [i0, j0, k0, i1, j1, k1] = P.box;
    const w = i1 - i0 + 1, h = j1 - j0 + 1;
    const full = new Float64Array(NX * NY * NZ), fullD = new Float64Array(NX * NY * NZ);
    const addSep = (dst, kxv, kyv, kzv) => {
      for (let k = 0; k < NZ; k++) { if (kzv[k] < 1e-14) continue; for (let j = 0; j < NY; j++) { const a = kzv[k] * kyv[j]; if (a < 1e-14) continue; const row = (k * NY + j) * NX; for (let i = 0; i < NX; i++) dst[row + i] += a * kxv[i]; } }
    };
    for (const b of blocksOf[p]) {
      const cx = b[0] + 0.5, cy = b[1] + 0.5, cz = b[2] + 0.5;
      const kxv = new Float64Array(NX), kyv = new Float64Array(NY), kzv = new Float64Array(NZ);
      for (let i = 0; i < NX; i++) kxv[i] = K.k(ox + (i + 0.5) / n - cx);
      for (let j = 0; j < NY; j++) kyv[j] = K.k(oy + (j + 0.5) / n - cy);
      for (let k = 0; k < NZ; k++) kzv[k] = K.k(oz + (k + 0.5) / n - cz);
      addSep(full, kxv, kyv, kzv);
      const bi = Math.round((b[0] - ox) * n), bj = Math.round((b[1] - oy) * n), bk = Math.round((b[2] - oz) * n);
      const dxv = new Float64Array(NX), dyv = new Float64Array(NY), dzv = new Float64Array(NZ);
      for (let i = 0; i < NX; i++) dxv[i] = disc1(i, bi);
      for (let j = 0; j < NY; j++) dyv[j] = disc1(j, bj);
      for (let k = 0; k < NZ; k++) dzv[k] = disc1(k, bk);
      addSep(fullD, dxv, dyv, dzv);
    }
    uA.set(p, full);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ue = P.u[((k - k0) * h + (j - j0)) * w + (i - i0)];
      const ua = full[(k * NY + j) * NX + i];
      const ud = fullD[(k * NY + j) * NX + i];
      maxErf = Math.max(maxErf, Math.abs(ue - ua));
      maxDisc = Math.max(maxDisc, Math.abs(ue - ud));
      sumErf2 += (ue - ua) ** 2; cnt++;
      maxU = Math.max(maxU, ue);
    }
  }
  // labels from analytic fields through the engine's psi with engine lambdas
  const N = NX * NY * NZ;
  const g = o.g, eps = o.eps;
  const Sall = new Float64Array(N);
  const Smat = new Map();
  for (const [p, u] of uA) {
    const m = phases[p].mat;
    if (!Smat.has(m)) Smat.set(m, new Float64Array(N));
    const Sm = Smat.get(m);
    for (let c = 0; c < N; c++) { Sall[c] += u[c]; Sm[c] += u[c]; }
  }
  let mism = 0, mismMargin = 0, solidA = 0, solidE = 0;
  for (let c = 0; c < N; c++) {
    let best = Sall[c], bp = 0, second = Infinity;
    for (const [p, u] of uA) {
      if (u[c] < 1e-5) continue;
      const sa = Sall[c], sm = Smat.get(phases[p].mat)[c];
      const v = (1 - sa) + g * (sa - sm) + eps * (sm - u[c]) - phases[p].lambda;
      if (v < best) { second = best; best = v; bp = p; } else if (v < second) second = v;
    }
    if (bp) solidA++;
    if (label[c]) solidE++;
    if (bp !== label[c]) { mism++; mismMargin = Math.max(mismMargin, Math.abs(second - best)); }
  }
  const r = {
    phases: phases.length - 1, cellsCompared: cnt, grid: [NX, NY, NZ], msStep: Math.round(msStep),
    maxAbs_engine_vs_erfSum: +maxErf.toExponential(3), rms_engine_vs_erfSum: +Math.sqrt(sumErf2 / cnt).toExponential(3),
    maxAbs_engine_vs_discreteSum_f64: +maxDisc.toExponential(3), maxU: +maxU.toFixed(5),
    step1LabelMismatchCells: mism, step1SolidCells_engine: solidE, step1SolidCells_analytic: solidA,
    maxMarginAtMismatch: +mismMargin.toExponential(3),
    lambdas: phases.slice(1).map((P) => +P.lambda.toFixed(5)),
  };
  res.configs[name] = r;
  console.log(name, JSON.stringify(r));
}
writeFileSync(out, JSON.stringify(res, null, 1));
