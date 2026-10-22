// prior's annealed-noise-fix refuteBy: 2D sq2-ABCD FREE n32, anneal 0.1 x 100 +
// quench on seeds 6-15; and frozen jitter 0.1 (not re-drawn) seeds 1-5.
// X persists if any 2x2 sub-cell window holds 4 distinct phases at the end.
import { writeFileSync } from 'node:fs';
import { runEngine } from './vu.mjs';
import { byName, to2D } from '../../lib/configs.mjs';
const blocks = to2D(byName('sq2-ABCD').blocks);
function xCount(sim) { const { NX, NY, label } = sim; let c = 0; for (let j = 0; j + 1 < NY; j++) for (let i = 0; i + 1 < NX; i++) { const s = new Set([label[j * NX + i], label[j * NX + i + 1], label[(j + 1) * NX + i], label[(j + 1) * NX + i + 1]]); if (s.size === 4 && !s.has(0)) c++; } return c; }
function wall(sim, p, q) { const { NX, NY, label } = sim; let c = 0; for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = label[j * NX + i]; if (a !== p && a !== q) continue; if (i + 1 < NX) { const b = label[j * NX + i + 1]; if ((a === p && b === q) || (a === q && b === p)) c++; } if (j + 1 < NY) { const b = label[(j + 1) * NX + i]; if ((a === p && b === q) || (a === q && b === p)) c++; } } return +(c / sim.n).toFixed(3); }
const out = [];
for (const [kind, seeds] of [['anneal', [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]], ['frozen0.1', [1, 2, 3, 4, 5]]]) for (const seed of seeds) {
  const sim = kind === 'anneal' ? runEngine(blocks, { dims: 2, n: 32, seed, maxSteps: 300 }, { anneal: { amp: 0.1, steps: 100 }, quenchSteps: 300 })
    : runEngine(blocks, { dims: 2, n: 32, seed, jitter: 0.1, maxSteps: 300 });
  // phases: 1 A(0,0) 2 B(1,0) 3 C(0,1) 4 D(1,1) in block order
  const rec = { kind, seed, steps: sim.steps, xWindows: xCount(sim), wallAD: wall(sim, 1, 4), wallBC: wall(sim, 2, 3) };
  out.push(rec); console.log(JSON.stringify(rec));
}
writeFileSync(new URL('./res-abcd-anneal.json', import.meta.url), JSON.stringify(out, null, 1));
