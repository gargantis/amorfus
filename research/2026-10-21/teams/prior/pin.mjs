// Pinning check (2D, NOVOL = plain MBO): a disk of radius R blocks drawn on
// the sub-cell grid. Curve shortening would remove area at pi s^2 blocks^2
// per step (dA/dt = -2 pi, h = s^2 / 2). Predicted pinning (derivation in
// REPORT): a boundary of curvature kappa moves kappa s^2 / 2 per step, and
// a binary grid needs about half a cell, so R_pin ~ s^2 / dx = s^2 n blocks
// (0.64 at n = 16, 1.28 at n = 32 for s = 0.2 blocks).
import { writeFileSync } from 'node:fs';
import { setup, step, gaussKernel, DEFAULTS } from '../../lib/mbo.mjs';
const out = { s_blocks: 0.2, theoryAreaLossPerStep: +(Math.PI * 0.04).toFixed(4), runs: [] };
for (const [n, R] of [[16, 0.5], [16, 0.75], [16, 1], [16, 1.25], [16, 1.5], [16, 2], [16, 2.25], [16, 2.5], [16, 2.75], [16, 3], [16, 4], [32, 0.5], [32, 0.75], [32, 1], [32, 1.25], [32, 1.5], [32, 2], [32, 3], [32, 4], [32, 5], [32, 6]]) {
  const W = Math.ceil(2 * R) + 1, blocks = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) blocks.push([x, y, 0, 6]);
  const o = { ...DEFAULTS, dims: 2, n, volume: false, maxSteps: 12, stopAfter: 99 };
  const sim = setup(blocks, o);
  const cx = W / 2, cy = W / 2;
  let a0 = 0;
  for (let j = 0; j < sim.NY; j++) for (let i = 0; i < sim.NX; i++) {
    const x = sim.ox + (i + 0.5) / n, y = sim.oy + (j + 0.5) / n;
    const inside = Math.hypot(x - cx, y - cy) <= R;
    sim.label[j * sim.NX + i] = inside ? 1 : 0; if (inside) a0++;
  }
  const ker = gaussKernel(0.2 * n);
  const areas = [a0 / (n * n)];
  for (let t = 0; t < 12; t++) { step(sim, o, ker); let a = 0; for (const v of sim.label) if (v) a++; areas.push(a / (n * n)); }
  const loss = (areas[0] - areas[areas.length - 1]) / 12;
  out.runs.push({ n, R, Rpin_pred: +(0.04 * n).toFixed(2), area0: +areas[0].toFixed(4), meanLossPerStep: +loss.toFixed(4),
    stepsWithNoChange: areas.slice(1).filter((a, i) => a === areas[i]).length, areas: areas.map((a) => +a.toFixed(4)) });
}
writeFileSync(new URL('./results-pin.json', import.meta.url), JSON.stringify(out, null, 1));
for (const r of out.runs) console.log(r.n, r.R, 'pred Rpin', r.Rpin_pred, 'loss/step', r.meanLossPerStep, 'theory', out.theoryAreaLossPerStep, 'frozen steps', r.stepsWithNoChange);
