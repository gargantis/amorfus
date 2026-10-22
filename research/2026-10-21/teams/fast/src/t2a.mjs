// Task 2(a): one Gaussian step thresholded at 1/2 (lambda 0): volume kept by
// small clusters vs sigma, and the sigma at which a single block vanishes.
//   node t2a.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { byName } from '../../../lib/configs.mjs';
import { buildModel, fracVolumes } from './model.mjs';
import { ownerOfCm } from './t2.mjs';
import { erf } from './kern.mjs';
const [out] = process.argv.slice(2);
const names = ['single', 'pair-same', 'line3-same', 'sq2-same', 'cube2-same', 'pillar3', 'ball-r2'];
const sigmas = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];
const res = { note: 'volume of {D > 0} / block count, model A0 (gauss, lambda 0); n = 12 grid', analyticSingleVanishSigma: null, rows: {} };
// single block centre value k(0)^3 = erf(1/(2 sqrt2 sigma))^3 = 1/2  ->  sigma*
let lo = 0.1, hi = 1; for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (erf(1 / (2 * Math.SQRT2 * m)) ** 3 > 0.5) lo = m; else hi = m; }
res.analyticSingleVanishSigma = +lo.toFixed(4);
for (const name of names) {
  const cfg = byName(name);
  res.rows[name] = {};
  for (const s of sigmas) {
    const m = buildModel(cfg.blocks, { n: 12, margin: 1.5 }, { kernel: 'gauss', sigma: s, lambda: 'none' });
    const v = fracVolumes(m, m.D, ownerOfCm(m.Cm));
    const tot = Object.values(v).reduce((a, b) => a + b, 0);
    res.rows[name][s] = +(tot / cfg.blocks.length).toFixed(4);
  }
  console.log(name, JSON.stringify(res.rows[name]));
}
console.log('single block vanishes (centre below 1/2) for sigma >', res.analyticSingleVanishSigma);
writeFileSync(out, JSON.stringify(res, null, 1));
