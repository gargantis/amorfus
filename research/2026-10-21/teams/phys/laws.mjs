// Bubble laws vs the FREE catalogue (team phys): for every single-cluster
// result, the engine pressure lambda (run value) against the Young-Laplace
// prediction lambda = (2/R) s_b / sqrt(2 pi), R = sphere radius of the volume.
// Also flags whether R exceeds the pinning radius 2 s_b^2 n.
import { readFileSync, writeFileSync } from 'node:fs';
import { sphereR } from './exact.mjs';
const D = new URL('./', import.meta.url).pathname;
const R = JSON.parse(readFileSync(`${D}free/results.json`, 'utf8'));
const rows = [];
for (const [name, c] of Object.entries(R)) {
  for (const [seed, run] of Object.entries(c.runs)) {
    if (run.phases.length !== 1) continue;
    const p = run.phases[0], r = sphereR(p.blocks), sb = 0.2, n = c.n;
    const pred = (2 / r) * sb / Math.sqrt(2 * Math.PI);
    rows.push({ name, seed: +seed, n, V: p.blocks, R: +r.toFixed(4), Rpin: +(2 * sb * sb * n).toFixed(3), pinnedPred: r > 2 * sb * sb * n, lambda: p.lambda, pred: +pred.toFixed(4), err: +(p.lambda / pred - 1).toFixed(4) });
  }
}
writeFileSync(`${D}laws/sphere-lambda.json`, JSON.stringify(rows, null, 1));
for (const r of rows.filter((x) => x.seed === 1)) console.log(r.name.padEnd(12), 'n' + r.n, 'V', String(r.V).padEnd(3), 'R', r.R.toFixed(3), 'Rpin', r.Rpin, r.pinnedPred ? 'PIN' : '   ', 'lambda', r.lambda.toFixed(4), 'pred', r.pred.toFixed(4), 'err', (100 * r.err).toFixed(1) + '%');
