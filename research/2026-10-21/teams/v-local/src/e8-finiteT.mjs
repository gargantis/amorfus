// E8: fast C5 (T engine steps ~ one volume-kept step at sigma 0.2 sqrt T),
// tested at T = 8 and 16 (and T = 4 as a calibration of this harness against
// fast's numbers). Physics FINITE-T at n 16 (engine unchanged, not cached);
// models Bx-g<sigma> (exact per-material lambda); surface mean distance to
// the physics render field D (fast's metrics, 300 lines, seed 7).
//   node e8-finiteT.mjs <out.json> <T> <sigmas> [names]
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { simulate } from '../../../lib/mbo.mjs';
import { byName } from '../../../lib/configs.mjs';
import { fieldView, lineSet, compareSurfaces } from '../../fast/src/metrics.mjs';
import { refCm } from '../../fast/src/t2.mjs';
import { buildModel, r4 } from './common.mjs';

const [out, Targ, sigArg, namesArg] = process.argv.slice(2);
const T = Number(Targ), sigmas = sigArg.split(',').map(Number);
const names = (namesArg ?? 'single,pair-same,pair-diff,line3-same,L3-ABC,sq2-checker,cube2-same,cube2-halves,diag-edge,stairs,tunnel,pillar3').split(',');
const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { note: 'FINITE-T physics (n 16) vs one-step Bx-g<sigma>', runs: {} };
const key = `T${T}`;
res.runs[key] = res.runs[key] ?? {};
for (const name of names) {
  const cfg = byName(name);
  if (res.runs[key][name]) continue;
  const sim = simulate(cfg.blocks, { maxSteps: T, stopAfter: 99, n: 16 });
  const ref = fieldView(sim, sim.D, refCm(sim));
  const lines = lineSet(cfg.blocks, 300, 7);
  const row = {};
  for (const s of sigmas) {
    const m = buildModel(cfg.blocks, { n: 16 }, { kernel: 'gauss', sigma: s, lambda: 'exact' });
    const surf = compareSurfaces(ref, fieldView(m, m.D, m.Cm), lines);
    row[s] = { mean: surf.mean, p95: surf.p95, unmatched: surf.unmatched };
  }
  res.runs[key][name] = row;
  console.log(key, name, Object.entries(row).map(([s, v]) => `${s}:${v.mean}`).join(' '));
  writeFileSync(out, JSON.stringify(res, null, 1));
}
// summary: mean over configs per sigma
const sum = {};
for (const s of sigmas) { const v = names.map((nm) => res.runs[key][nm][s].mean); sum[s] = r4(v.reduce((a, b) => a + b, 0) / v.length); }
res.summary = res.summary ?? {}; res.summary[key] = sum;
const best = Object.entries(sum).sort((a, b) => a[1] - b[1])[0];
console.log(key, 'mean over configs', JSON.stringify(sum), 'best', best, 'predicted 0.2 sqrt T =', r4(0.2 * Math.sqrt(T)));
writeFileSync(out, JSON.stringify(res, null, 1));
