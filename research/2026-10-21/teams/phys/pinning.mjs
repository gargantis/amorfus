// Pinning law test (team phys): single-material cubes under FREE at several
// (n, s). Prediction (derived in REPORT.md): a flat face can only advance if
// the bubble's mean curvature 2/R exceeds 1/s_sub^2 per sub-cell, i.e.
// R < R_pin = 2 s_b^2 n blocks; larger bubbles stall as rounded boxes.
//   node pinning.mjs <shape> <n> <s_b> [margin]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { A, byName } from '../../lib/configs.mjs';
import { simulateKeep, facePoints, fitSphere } from './labtools.mjs';
import { renderSlice, savePng } from '../../lib/render.mjs';
import { sphereR } from './exact.mjs';

const box = (k) => { const out = []; for (let y = 0; y < k; y++) for (let z = 0; z < k; z++) for (let x = 0; x < k; x++) out.push([x, y, z, A]); return out; };
const SHAPES = { cube2: box(2), cube3: box(3), cube4: box(4), tunnel: byName('tunnel').blocks };
const [shape, nArg, sArg, mArg] = process.argv.slice(2);
const n = +nArg, sb = +sArg, margin = mArg ? +mArg : 1;
const blocks = SHAPES[shape];
const sim = simulateKeep(blocks, { n, s: sb * n, maxSteps: 600, margin, jitter: 1e-3, seed: 1 });
const p = sim.phases.findIndex((P, i) => i && P.alive);
const pts = facePoints(sim, p, 0);
const f = fitSphere(pts);
let rmin = Infinity, rmax = 0;
for (const q of pts) { const r = Math.hypot(q[0] - f.c[0], q[1] - f.c[1], q[2] - f.c[2]); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
const R = sphereR(blocks.length);
const Rpin = 2 * sb * sb * n;
const rec = { shape, n, sb, margin, volume: blocks.length, R, Rpin, predictedPinned: R > Rpin, steps: sim.steps, converged: !!sim.converged,
  fitR: f.r, rms: f.rms, maxDev: f.maxDev, spread: (rmax - rmin) / R, lambdaRun: sim.lambdaRun[p], ms: Math.round(sim.ms) };
const dir = new URL('./pinning/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const path = `${dir}results.json`;
const all = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
all.push(rec);
writeFileSync(path, JSON.stringify(all, null, 1));
const mid = blocks.reduce((s, b) => s + b[2], 0) / blocks.length + 0.5;
savePng(`${dir}${shape}-n${n}-s${sb}-slice.png`, renderSlice(sim, { axis: 2, at: mid, ppb: 40 }));
console.log(JSON.stringify(rec));
