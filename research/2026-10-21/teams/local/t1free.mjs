// Task 1, FREE: influence of one block on a small cluster that relaxes to a
// sphere (3D, n = 16, maxSteps 400). Base: 1x1x6 A bar along x. Perturb the
// end: add a block at x = 6, remove block x = 5, recolour block x = 5 to B.
// Probe: surface crossings along rays from the base bubble's centroid, and
// the surface at the far end (-x) of the bar.
import { writeFileSync } from 'node:fs';
import { runSim, simInfo, fmt } from './lib/loc.mjs';
import { finishLocal } from './lib/mbo-box.mjs';
import { surfaceAlong } from '../../lib/measure.mjs';
const A = 6, B = 7;
const bar = []; for (let x = 0; x < 6; x++) bar.push([x, 0, 0, A]);
const variants = { base: bar, add: [...bar, [6, 0, 0, A]], remove: bar.slice(0, 5), recolour: bar.map((b) => (b[0] === 5 ? [5, 0, 0, B] : b)) };
const bbox = [0, 0, 0, 6, 0, 0];
const centroid = (sim) => { const s = [0, 0, 0]; let n = 0; const { NX, NY, N } = sim; for (let c = 0; c < N; c++) if (sim.label[c] && sim.phases[sim.label[c]].mat === A) { const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY)); s[0] += sim.ox + (i + 0.5) / sim.n; s[1] += sim.oy + (j + 0.5) / sim.n; s[2] += sim.oz + (k + 0.5) / sim.n; n++; } return s.map((v) => +(v / n).toFixed(4)); };
const DIRS = { '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
const out = { note: '1x1x6 A bar, FREE (maxSteps 400), n = 16, bbox fixed', runs: {} };
let c0 = null;
for (const [v, blocks] of Object.entries(variants)) {
  const sim = runSim(blocks, 'FREE', { n: 16, bbox });
  const info = simInfo(sim);
  const cen = centroid(sim);
  if (v === 'base') c0 = cen;
  const rays = (s) => Object.fromEntries(Object.entries(DIRS).map(([k, d]) => { const r = surfaceAlong(s, c0, d, 4); return [k, r ? fmt(r.t) : null]; }));
  const rF = rays(sim); finishLocal(sim, sim.opts); const r0 = rays(sim);
  out.runs[v] = { info, centroidA: cen, raysFull: rF, rays0: r0 };
  console.log(`${v}: ${sim.ms} ms ${sim.steps} st${sim.converged ? '' : ' NC'} | ${info.phases.map((p) => `${p.mat}:${p.blocks}->${p.volume} lam ${p.lamRun}`).join(' ')} | centroid ${cen} | rays0 ${JSON.stringify(r0)}`);
}
for (const v of ['add', 'remove', 'recolour']) {
  out.runs[v].delta0 = Object.fromEntries(Object.keys(DIRS).map((k) => [k, out.runs[v].rays0[k] !== null && out.runs.base.rays0[k] !== null ? fmt(out.runs[v].rays0[k] - out.runs.base.rays0[k]) : null]));
  console.log(v, 'delta along rays from base centroid (D0):', JSON.stringify(out.runs[v].delta0));
}
writeFileSync(new URL('./res/t1-free.json', import.meta.url), JSON.stringify(out, null, 1));
