// Task 4 images: plan slices (and a view) of ambiguous-contact outcomes, n = 16.
// node img4.mjs <regime> <variant: j0|s1|s2|s3|rev> <name,name,...>
import { mkdirSync } from 'node:fs';
import { runSim } from './lib/loc.mjs';
import { renderView, renderSlice, savePng } from '../../lib/render.mjs';
import { byName } from '../../lib/configs.mjs';
const A = 6, B = 7;
const [regName, variant, names] = process.argv.slice(2);
const plan = (rows, y = 0) => { const M = { A, B }; const o = []; rows.forEach((r, z) => [...r].forEach((ch, x) => { if (M[ch]) o.push([x, y, z, M[ch]]); })); return o; };
const ARMS = { A1: [[1, 0], [0, 1], [0, 0]], A2: [[2, 3], [3, 2], [3, 3]], B1: [[3, 1], [2, 0], [3, 0]], B2: [[0, 2], [1, 3], [0, 3]] };
const checker = (sa, sb) => { const cells = [[1, 1, A], [2, 2, A], [2, 1, B], [1, 2, B]]; for (let i = 0; i < sa - 1; i++) cells.push([...ARMS.A1[i], A], [...ARMS.A2[i], A]); for (let i = 0; i < sb - 1; i++) cells.push([...ARMS.B1[i], B], [...ARMS.B2[i], B]); return cells.map(([x, z, m]) => [x, 0, z, m]); };
const get = (name) => {
  const m = name.match(/^checker-A(\d)-B(\d)$/); if (m) return checker(+m[1], +m[2]);
  if (name === 'diag-edge-3v1') return plan(['AA.', 'A.A']);
  if (name === 'diag-edge-3v3') return plan(['AA..', 'A.AA', '..A.']);
  if (name === 'slab-line4') return plan(['ABBB', 'BABB', 'BBAB', 'BBBA']);
  return byName(name).blocks;
};
const dir = new URL('./img/t4/', import.meta.url).pathname; mkdirSync(dir, { recursive: true });
for (const name of names.split(',')) {
  let blocks = get(name); const extra = { n: 16 };
  if (variant === 'rev') blocks = blocks.slice().reverse(); else if (variant !== 'j0') { extra.jitter = 1e-3; extra.seed = +variant.slice(1); }
  const sim = runSim(blocks, regName, extra);
  const flat = blocks.every((b) => b[1] === blocks[0][1]);
  const bmin = [0, 1, 2].map((t) => Math.min(...blocks.map((b) => b[t]))), bmax = [0, 1, 2].map((t) => Math.max(...blocks.map((b) => b[t])) + 1);
  if (flat) savePng(`${dir}${name}-${regName}-${variant}-plan.png`, renderSlice(sim, { axis: 1, at: blocks[0][1] + 0.5, ppb: 50 }));
  savePng(`${dir}${name}-${regName}-${variant}-view.png`, renderView(sim, { bounds: { min: bmin, max: bmax }, width: 320, height: 240 }));
  console.log(name, regName, variant, sim.steps, 'steps', sim.phases.filter((p, i) => i && p.alive).map((p) => p.mat).join(','));
}
