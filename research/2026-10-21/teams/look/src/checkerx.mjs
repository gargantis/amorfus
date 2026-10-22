// sq2-checker FREE, jitter 1e-3 seed 2: where do both diagonal pairs connect?
import { simulate } from '../../../lib/mbo.mjs';
import { renderSlice, renderView, savePng } from '../../../lib/render.mjs';
import { byName } from '../../../lib/configs.mjs';
import { blockBounds } from '../../../lib/run.mjs';
import * as M from './lm.mjs';
const out = process.argv[2];
const cfg = byName('sq2-checker');
const sim = simulate(cfg.blocks, { maxSteps: 300, jitter: 1e-3, seed: 2 });
savePng(`${out}/view.png`, renderView(sim, { bounds: blockBounds(cfg.blocks), width: 320, height: 240 }));
for (const y of [0.15, 0.5, 0.85]) savePng(`${out}/plan-y${y}.png`, renderSlice(sim, { axis: 1, at: y, ppb: 60 }));
savePng(`${out}/diag-section.png`, renderSlice(sim, { axis: 0, at: 1.0, ppb: 60 }));
// per height: is A connected across the junction in that layer? is B?
const rows = [];
for (let y = -0.2; y <= 1.21; y += 0.0625) {
  const lo = [0, y, 0], hi = [2, y + 1 / 16, 2];
  rows.push([+y.toFixed(3), M.connectedIn(sim, 6, [0.5, y, 0.5], [1.5, y, 1.5], lo, hi), M.connectedIn(sim, 7, [1.5, y, 0.5], [0.5, y, 1.5], lo, hi)]);
}
console.log(JSON.stringify({ steps: sim.steps, end: M.phaseCounts(sim), layers: rows.filter((r) => r[1] || r[2]) }));
