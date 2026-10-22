// prior 'fid-is-tvl1' attack: 2D 4x4 square, FID-k without / with volume, vary s
// at fixed k. Prediction (prior): corner radius r = s/(k*sqrt(2*pi)) (s in blocks).
import { writeFileSync } from 'node:fs';
import { simulate } from '../../../lib/mbo.mjs';
const V = new URL('..', import.meta.url).pathname;
const blocks = []; for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) blocks.push([x, y, 0, 6]);
const out = [];
const n = 64;
for (const volume of [false, true]) for (const k of [0.1, 0.15, 0.3]) for (const sb of [0.1, 0.15, 0.2, 0.3]) {
  const t0 = performance.now();
  const sim = simulate(blocks, { dims: 2, n, s: sb * n, volume, anchor: { kind: 'fidelity', k }, maxSteps: 300 });
  // inset along the diagonal from corner (4,4) toward (2,2)
  const lab = (x, y) => sim.label[Math.floor((y - sim.oy) * n) * sim.NX + Math.floor((x - sim.ox) * n)];
  let t = 0; const h = 1 / (4 * n);
  while (t < 2 && !lab(4 - t / Math.SQRT2 - 1e-9, 4 - t / Math.SQRT2 - 1e-9)) t += h;
  const r = t / (Math.SQRT2 - 1);
  const pred = sb / (k * Math.sqrt(2 * Math.PI));
  // cycle detection: label changes per step at the end
  const row = { volume, k, s: sb, n, steps: sim.steps, converged: !!sim.converged, last: sim.history.slice(-3), inset: +t.toFixed(4), r: +r.toFixed(3), rPred: +pred.toFixed(3), ratio: +(r / pred).toFixed(3), ms: Math.round(performance.now() - t0) };
  out.push(row); console.log(JSON.stringify(row));
}
writeFileSync(`${V}res/tvl1-s-scaling.json`, JSON.stringify(out, null, 1));
