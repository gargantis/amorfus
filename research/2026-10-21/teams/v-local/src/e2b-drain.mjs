// E2b: where does the volume go in the far-bar scene? Solid volume (labels)
// in the bar region x >= 6, in the tunnel hole (x 1..2, y 1..3) and in the
// rest of the host, physics FID-0.15 / FINITE-4 (n 12) and the cheap model.
import { writeFileSync } from 'node:fs';
import { simulate } from '../../../lib/mbo.mjs';
import { model, wideHost, bar, r4 } from './common.mjs';
const [out] = process.argv.slice(2);
const res = {};
const blocks = [...wideHost(), ...bar(6)];
const regions = (x, y, z) => (x >= 6 ? 'bar' : x >= 1 && x < 2 && y >= 1 && y < 3 ? 'tunnelHole' : 'host');
function tally(grid, solidAt) {
  const t = { bar: 0, tunnelHole: 0, host: 0 }, v = 1 / grid.n ** 3;
  for (let k = 0; k < grid.NZ; k++) for (let j = 0; j < grid.NY; j++) for (let i = 0; i < grid.NX; i++) {
    if (!solidAt(i, j, k)) continue;
    const x = grid.ox + (i + 0.5) / grid.n, y = grid.oy + (j + 0.5) / grid.n, z = grid.oz + (k + 0.5) / grid.n;
    t[regions(x, y, z)] += v;
  }
  return Object.fromEntries(Object.entries(t).map(([k, q]) => [k, r4(q)]));
}
for (const [reg, opts] of [['FID-0.15', { anchor: { kind: 'fidelity', k: 0.15 } }], ['FINITE-4', { maxSteps: 4, stopAfter: 99 }]]) {
  const sim = simulate(blocks, { ...opts, n: 12 });
  res[reg] = tally(sim, (i, j, k) => sim.label[(k * sim.NY + j) * sim.NX + i] !== 0);
  console.log(reg, JSON.stringify(res[reg]));
}
const m = model(blocks, 'Bl-b1s20', 12);
res['Bl-b1s20 (D>0 cells)'] = tally(m, (i, j, k) => m.D[(k * m.NY + j) * m.NX + i] > 0);
res.blocks = { bar: 4, tunnelHole: 0, host: blocks.length - 4 };
console.log('model', JSON.stringify(res['Bl-b1s20 (D>0 cells)']), 'blocks', JSON.stringify(res.blocks));
writeFileSync(out, JSON.stringify(res, null, 1));
