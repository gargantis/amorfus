// Attack on prior's x-fixed-point: count label changes within 1 block of an
// axis-aligned four-material cross (jitter 0) after 5 and 60 steps, for equal
// quadrants (prior's case), unequal quadrant sizes (unequal pressures), and a
// same-material checker cross with unequal sizes. 2D, n 32, g 1 and 0.5.
import { writeFileSync } from 'node:fs';
import { setup, step, gaussKernel, DEFAULTS } from '../../lib/mbo.mjs';
const A = 6, B = 7, C = 1, D = 4;
const quad = (wA, wB, wC, wD, mats = [A, B, C, D]) => {
  // cross at (0,0); A lower-left (wA x wA), B lower-right, C upper-left, D upper-right
  const o = [];
  const sq = (x0, y0, sx, sy, w, m) => { for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) o.push([x0 + sx * i, y0 + sy * j, 0, m]); };
  sq(-1, -1, -1, -1, wA, mats[0]); sq(0, -1, 1, -1, wB, mats[1]); sq(-1, 0, -1, 1, wC, mats[2]); sq(0, 0, 1, 1, wD, mats[3]);
  return o;
};
const CASES = {
  'ABCD 2/2/2/2 (prior)': quad(2, 2, 2, 2),
  'ABCD 3/2/2/2': quad(3, 2, 2, 2),
  'ABCD 3/2/2/1': quad(3, 2, 2, 1),
  'ABCD 4/2/2/2': quad(4, 2, 2, 2),
  'checker A2 B2 B2 A2': quad(2, 2, 2, 2, [A, B, B, A]),
  'checker A3 B2 B2 A3': quad(3, 2, 2, 3, [A, B, B, A]),
};
const out = [];
for (const [name, blocks] of Object.entries(CASES)) for (const g of [1, 0.5]) {
  const o = { ...DEFAULTS, dims: 2, n: 32, g };
  const sim = setup(blocks, o);
  const before = sim.label.slice();
  const ker = gaussKernel(0.2 * o.n);
  const count = () => { let near = 0; for (let j = 0; j < sim.NY; j++) for (let i = 0; i < sim.NX; i++) { const c = j * sim.NX + i; if (sim.label[c] === before[c]) continue; const x = sim.ox + (i + 0.5) / sim.n, y = sim.oy + (j + 0.5) / sim.n; if (Math.hypot(x, y) <= 1) near++; } return near; };
  // the 4 sub-cells touching the cross point: still four different phases?
  const ci = Math.round((0 - sim.ox) * sim.n), cj = Math.round((0 - sim.oy) * sim.n);
  const four = () => new Set([sim.label[(cj - 1) * sim.NX + ci - 1], sim.label[(cj - 1) * sim.NX + ci], sim.label[cj * sim.NX + ci - 1], sim.label[cj * sim.NX + ci]]).size;
  let n5 = null; const lam = [];
  for (let t = 1; t <= 60; t++) { const r = step(sim, o, ker); if (t === 1) for (let p = 1; p < sim.phases.length; p++) lam.push(+sim.phases[p].lambda.toFixed(4)); if (t === 5) n5 = count(); }
  const rec = { name, g, changedNear5: n5, changedNear60: count(), phasesAtCrossAfter60: four(), lambdaStep1: lam };
  out.push(rec); console.log(JSON.stringify(rec));
}
writeFileSync(new URL('./res-xfixed2.json', import.meta.url), JSON.stringify(out, null, 1));
