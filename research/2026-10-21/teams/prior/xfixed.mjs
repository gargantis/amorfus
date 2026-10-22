// One threshold step on four 2x2-block quadrants (A B / C D, 2D, n = 32):
// count label changes within 1 block of the four-way point, with and without
// the volume solve, for equal tensions (g = 1). The analytic claim (REPORT):
// for a Gaussian kernel the blurred quadrant indicators are products
// Phi(x/s) Phi(y/s), so each cell's least cost is its own quadrant and the
// cross is an exact fixed point of the unconstrained step.
import { writeFileSync } from 'node:fs';
import { setup, step, gaussKernel, DEFAULTS } from '../../lib/mbo.mjs';
const A = 6, B = 7, C = 1, D = 4;
const blocks = [];
for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) blocks.push([x, y, 0, x < 2 ? (y < 2 ? A : B) : (y < 2 ? C : D)]);
const out = { runs: [] };
for (const volume of [false, true]) for (const g of [1, 0.5]) {
  const o = { ...DEFAULTS, dims: 2, n: 32, volume, g };
  const sim = setup(blocks, o);
  const before = sim.label.slice();
  const ker = gaussKernel(0.2 * o.n);
  let near = 0, all = 0;
  for (let t = 0; t < 5; t++) step(sim, o, ker);
  for (let j = 0; j < sim.NY; j++) for (let i = 0; i < sim.NX; i++) {
    const c = j * sim.NX + i; if (sim.label[c] === before[c]) continue;
    all++;
    const x = sim.ox + (i + 0.5) / sim.n, y = sim.oy + (j + 0.5) / sim.n;
    if (Math.hypot(x - 2, y - 2) <= 1) near++;
  }
  out.runs.push({ volume, g, steps: 5, changedCellsTotal: all, changedWithin1BlockOfCross: near });
}
writeFileSync(new URL('./results-xfixed.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
