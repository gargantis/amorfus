// Task 2: local models against the physics references.
//   node t2.mjs <REGIME> <names|all> <modelIds,...> <outJSON> [lines]
// Loads the cached reference (refs.mjs), builds each model on the same grid,
// and records surface distance, seam distance, volume error per material.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CONFIGS, byName } from '../../../lib/configs.mjs';
import { loadRef, nFor } from './refs.mjs';
import { buildModel, fracVolumes, iterate } from './model.mjs';
import { fieldView, lineSet, compareSurfaces, compareSeams } from './metrics.mjs';
import { MODELS } from './models.mjs';

export function refCm(sim) {
  const { NX, NY, NZ, N } = sim;
  const Cm = new Map();
  for (let p = 1; p < sim.phases.length; p++) {
    const P = sim.phases[p];
    if (!P.alive || !P.val) continue;
    if (!Cm.has(P.mat)) Cm.set(P.mat, new Float32Array(N).fill(9));
    const C = Cm.get(P.mat);
    const [i0, j0, k0, i1, j1, k1] = P.box;
    const w = i1 - i0 + 1, h = j1 - j0 + 1;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = P.val[((k - k0) * h + (j - j0)) * w + (i - i0)];
      const c = (k * NY + j) * NX + i;
      if (v < C[c]) C[c] = v;
    }
  }
  return Cm;
}

export function ownerOfCm(Cm) {
  const mats = [...Cm.keys()], arrs = mats.map((m) => Cm.get(m));
  return (c) => { let bm = 0, bv = Infinity; for (let q = 0; q < mats.length; q++) { const v = arrs[q][c]; if (v < bv) { bv = v; bm = mats[q]; } } return bm; };
}

export function blockVolumes(blocks) {
  const v = {};
  for (const b of blocks) v[b[3]] = (v[b[3]] ?? 0) + 1;
  return v;
}

export function makeModel(cfg, spec) {
  const m = buildModel(cfg.blocks, { n: nFor(cfg.name) }, spec);
  if (spec.iters && spec.iters > 1) iterate(m, spec.iters - 1, { s: (spec.sigma ?? 0.2) * m.n, lambdaMode: spec.lambda === 'exact' ? 'exact' : 'keep' });
  return m;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [regime, names, modelIds, out, nLines = '300'] = process.argv.slice(2);
  const pick = names === 'all' ? CONFIGS : names.split(',').map((n) => byName(n));
  const ids = modelIds.split(',');
  const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { regime, lines: Number(nLines), runs: {} };
  for (const cfg of pick) {
    if (res.runs[cfg.name] && ids.every((id) => res.runs[cfg.name].models[id])) { console.log(`${cfg.name}: done`); continue; }
    const t0 = performance.now();
    const { sim, meta } = loadRef(regime, cfg);
    const rCm = refCm(sim);
    const ref = fieldView(sim, sim.D, rCm);
    const lines = lineSet(cfg.blocks, Number(nLines), 7);
    const bv = blockVolumes(cfg.blocks);
    const rv = fracVolumes(sim, sim.D, ownerOfCm(rCm));
    const row = res.runs[cfg.name] ?? { refVolumes: rv, blockVolumes: bv, refSteps: meta.steps, refPhasesAlive: meta.phases.filter((P, i) => i && P.alive).length, models: {} };
    for (const id of ids) {
      if (row.models[id]) continue;
      const spec = MODELS[id];
      if (!spec) throw new Error(`no model ${id}`);
      const t1 = performance.now();
      const m = makeModel(cfg, spec);
      const mv = fieldView(m, m.D, m.Cm);
      const surf = compareSurfaces(ref, mv, lines);
      const seam = compareSeams(ref, mv, lines);
      const vol = fracVolumes(m, m.D, ownerOfCm(m.Cm));
      const volErr = {};
      for (const k of Object.keys(bv)) volErr[k] = +(((vol[k] ?? 0) - bv[k]) / bv[k]).toFixed(4);
      row.models[id] = { surf, seam, volErr, lambdas: m.P.slice(1).map((Q) => +Q.lambda.toFixed(4)), ms: Math.round(performance.now() - t1) };
      console.log(`${regime} ${cfg.name} ${id}: surf mean ${surf.mean} p95 ${surf.p95} max ${surf.max} unm ${surf.unmatched} bias ${surf.bias} | seam mean ${seam.mean ?? '-'} p95 ${seam.p95 ?? '-'} n ${seam.n} | vol ${JSON.stringify(volErr)} | lam ${row.models[id].lambdas.slice(0, 4).join(',')}`);
    }
    res.runs[cfg.name] = row;
    writeFileSync(out, JSON.stringify(res, null, 1));
    console.log(`  (${cfg.name} ${Math.round(performance.now() - t0)} ms, rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB)`);
  }
}
