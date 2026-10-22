// Checks of the engine against prior art (team prior). Uses lib/mbo.mjs
// unchanged; the time loop below is a copy of mbo.run() with two options:
//  - annealed jitter: re-seed the noise every step (auction dynamics'
//    "temperature" re-samples; the engine's default noise is frozen per
//    (cell, phase, seed));
//  - a pre-split seed at a four-way junction (a T1 nucleus of radius r
//    sub-cells, giving one diagonal pair a short shared wall).
// Usage: node --max-old-space-size=700 xjunc.mjs <experiment> ; writes
// results-<experiment>.json and PNGs in ./img/.
import { writeFileSync, mkdirSync } from 'node:fs';
import { setup, step, finish, gaussKernel, DEFAULTS, volumes } from '../../lib/mbo.mjs';
import { renderSlice, savePng } from '../../lib/render.mjs';
import { byName, to2D, A, B as Bm } from '../../lib/configs.mjs';

const HERE = new URL('.', import.meta.url).pathname;
mkdirSync(HERE + 'img', { recursive: true });

function make(blocks, regime) {
  const o = { ...DEFAULTS, ...regime };
  if (regime.dims === 2 && regime.n === undefined) o.n = 32;
  const sim = setup(blocks, o);
  sim.opts = o;
  return { sim, o };
}
const cellAt = (sim, x, y, z = 0.5) => {
  const i = Math.floor((x - sim.ox) * sim.n), j = Math.floor((y - sim.oy) * sim.n);
  const k = sim.NZ > 1 ? Math.floor((z - sim.oz) * sim.n) : 0;
  return (k * sim.NY + j) * sim.NX + i;
};
const phaseAtPoint = (sim, x, y, z) => sim.label[cellAt(sim, x, y, z)];

function runLoop(sim, o, { annealed = false } = {}) {
  const ker = gaussKernel(o.s ?? 0.2 * o.n);
  sim.history = []; let quiet = 0; const seed0 = o.seed;
  for (let t = 1; t <= o.maxSteps; t++) {
    if (annealed) o.seed = seed0 * 7919 + t;
    const r = step(sim, o, ker);
    sim.history.push(r.changes);
    quiet = r.changes <= o.stopTol && !r.merges ? quiet + 1 : 0;
    sim.steps = t;
    if (quiet >= o.stopAfter) { sim.converged = true; break; }
  }
  o.seed = seed0;
  return sim;
}

// face-adjacent sub-cell pairs between root phases p and q
function contact(sim, p, q) {
  const { NX, NY, NZ, label } = sim; let c = 0;
  const strides = NZ > 1 ? [1, NX, NX * NY] : [1, NX];
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = label[(k * NY + j) * NX + i];
    if (a !== p && a !== q) continue;
    if (i + 1 < NX) { const b = label[(k * NY + j) * NX + i + 1]; if ((a === p && b === q) || (a === q && b === p)) c++; }
    if (j + 1 < NY) { const b = label[(k * NY + j + 1) * NX + i]; if ((a === p && b === q) || (a === q && b === p)) c++; }
    if (NZ > 1 && k + 1 < NZ) { const b = label[((k + 1) * NY + j) * NX + i]; if ((a === p && b === q) || (a === q && b === p)) c++; }
  }
  return c;
}
// 2x2 sub-cell windows (in each axis plane) holding 4 distinct solid phases:
// the discrete trace of a four-way junction (a point in 2D, a line in 3D).
function xCount(sim) {
  const { NX, NY, NZ, label } = sim; let c = 0;
  const L = (i, j, k) => label[(k * NY + j) * NX + i];
  const four = (a, b, d, e) => a && b && d && e && a !== b && a !== d && a !== e && b !== d && b !== e && d !== e;
  for (let k = 0; k < NZ; k++) for (let j = 0; j + 1 < NY; j++) for (let i = 0; i + 1 < NX; i++) {
    if (four(L(i, j, k), L(i + 1, j, k), L(i, j + 1, k), L(i + 1, j + 1, k))) c++;
    if (NZ > 1 && k + 1 < NZ) {
      if (four(L(i, j, k), L(i + 1, j, k), L(i, j, k + 1), L(i + 1, j, k + 1))) c++;
      if (four(L(i, j, k), L(i, j + 1, k), L(i, j, k + 1), L(i, j + 1, k + 1))) c++;
    }
  }
  return c;
}
const root = (sim, p) => { while (sim.root[p] !== p) p = sim.root[p]; return p; };

// ---------------------------------------------------------------- E2 / E3
// sq2-ABCD (2D): A(0,0) B(1,0) C(0,1) D(1,1); diagonals A-D and B-C.
function abcd2D({ r = 0, jitter = 0, seed = 1, annealed = false, maxSteps = 300, n, quench = false }) {
  const blocks = to2D(byName('sq2-ABCD').blocks);
  const { sim, o } = make(blocks, { dims: 2, maxSteps, jitter, seed, ...(n ? { n } : {}) });
  const pA = phaseAtPoint(sim, 0.5, 0.5), pB = phaseAtPoint(sim, 1.5, 0.5), pC = phaseAtPoint(sim, 0.5, 1.5), pD = phaseAtPoint(sim, 1.5, 1.5);
  if (r > 0) { // T1 nucleus: inside radius r sub-cells of (1,1), A below the anti-diagonal, D above
    for (let j = 0; j < sim.NY; j++) for (let i = 0; i < sim.NX; i++) {
      const x = sim.ox + (i + 0.5) / sim.n, y = sim.oy + (j + 0.5) / sim.n;
      if (Math.hypot(x - 1, y - 1) * sim.n <= r) sim.label[j * sim.NX + i] = (x - 1) + (y - 1) < 0 ? pA : pD;
    }
  }
  const x0 = xCount(sim), ad0 = contact(sim, pA, pD), bc0 = contact(sim, pB, pC);
  runLoop(sim, o, { annealed });
  const annealSteps = sim.steps;
  if (quench) { o.jitter = 0; o.maxSteps = 300; runLoop(sim, o); }
  finish(sim, o);
  return { sim, res: { r, jitter, seed, annealed, quench, annealSteps, n: sim.n, steps: sim.steps, converged: !!sim.converged,
    start: { xWindows: x0, contactAD: ad0, contactBC: bc0 },
    end: { xWindows: xCount(sim), contactAD: contact(sim, pA, pD), contactBC: contact(sim, pB, pC),
      contactAD_blocks: +(contact(sim, pA, pD) / sim.n).toFixed(3), contactBC_blocks: +(contact(sim, pB, pC) / sim.n).toFixed(3) },
    lastChanges: sim.history.slice(-5), volumes: volumes(sim).map((v) => +v.volume.toFixed(3)) } };
}

// 3D sq2-ABCD (a 2x1x2 slab, four materials around one vertical lattice edge)
function abcd3D({ jitter = 0, seed = 1, annealed = false, maxSteps = 300, quench = false }) {
  const blocks = byName('sq2-ABCD').blocks; // x-z plane, y = 0
  const { sim, o } = make(blocks, { maxSteps, jitter, seed });
  const pA = phaseAtPoint(sim, 0.5, 0.5, 0.5), pB = phaseAtPoint(sim, 1.5, 0.5, 0.5), pC = phaseAtPoint(sim, 0.5, 0.5, 1.5), pD = phaseAtPoint(sim, 1.5, 0.5, 1.5);
  const x0 = xCount(sim);
  runLoop(sim, o, { annealed });
  const annealSteps = sim.steps;
  if (quench) { o.jitter = 0; o.maxSteps = 300; runLoop(sim, o); }
  finish(sim, o);
  return { sim, res: { dims: 3, jitter, seed, annealed, quench, annealSteps, n: sim.n, steps: sim.steps, converged: !!sim.converged,
    start: { xWindows: x0 }, end: { xWindows: xCount(sim), xLine_blocks: +(xCount(sim) / sim.n).toFixed(3),
      wallAD_blocks2: +(contact(sim, pA, pD) / sim.n ** 2).toFixed(3), wallBC_blocks2: +(contact(sim, pB, pC) / sim.n ** 2).toFixed(3) },
    lastChanges: sim.history.slice(-5) } };
}

// ---------------------------------------------------------------- E4
// 2D equal double bubble with A-B tension g: closed form (Young / Neumann
// balance at each triple point; flat wall by symmetry):
//   c = gR/2 (arc centre offset from the wall), R^2 [pi - acos(g/2) + (g/2) sqrt(1 - g^2/4)] = 1,
//   wall half-length = R sqrt(1 - g^2/4), wall-to-tip = R (1 + g/2),
//   air-side opening angle at the junction = 2 acos(g/2).
function theory2D(g) {
  const F = Math.PI - Math.acos(g / 2) + (g / 2) * Math.sqrt(1 - g * g / 4);
  const R = 1 / Math.sqrt(F);
  return { R: +R.toFixed(4), wallHalf: +(R * Math.sqrt(1 - g * g / 4)).toFixed(4), tip: +(R * (1 + g / 2)).toFixed(4), openingDeg: +(2 * Math.acos(g / 2) * 180 / Math.PI).toFixed(1) };
}
function pairG({ g, n = 32, maxSteps = 400 }) {
  const blocks = to2D(byName('pair-diff').blocks);
  const { sim, o } = make(blocks, { dims: 2, n, g, maxSteps });
  runLoop(sim, o);
  finish(sim, o);
  const pA = phaseAtPoint(sim, 0.5, 0.5), pB = phaseAtPoint(sim, 1.5, 0.5);
  // wall: horizontal A|B neighbour pairs; its x position and vertical extent
  let wx = 0, wn = 0, ymin = Infinity, ymax = -Infinity, xminA = Infinity, xmaxB = -Infinity, ycen = 0, yc = 0;
  for (let j = 0; j < sim.NY; j++) for (let i = 0; i < sim.NX; i++) {
    const a = sim.label[j * sim.NX + i];
    const x = sim.ox + (i + 0.5) / sim.n, y = sim.oy + (j + 0.5) / sim.n;
    if (a === pA) xminA = Math.min(xminA, x - 0.5 / sim.n);
    if (a === pB) xmaxB = Math.max(xmaxB, x + 0.5 / sim.n);
    if (a === pA || a === pB) { ycen += y; yc++; }
    if (i + 1 < sim.NX) {
      const b = sim.label[j * sim.NX + i + 1];
      if ((a === pA && b === pB) || (a === pB && b === pA)) { wx += x + 0.5 / sim.n; wn++; ymin = Math.min(ymin, y - 0.5 / sim.n); ymax = Math.max(ymax, y + 0.5 / sim.n); }
    }
  }
  const wall = wx / wn;
  return { sim, res: { g, n, steps: sim.steps, converged: !!sim.converged, measuredOn: 'labels',
    wallX: +wall.toFixed(4), wallHalf: +((ymax - ymin) / 2).toFixed(4), tipB: +(xmaxB - wall).toFixed(4), tipA: +(wall - xminA).toFixed(4),
    theory: theory2D(g), volumes: volumes(sim).map((v) => +v.volume.toFixed(3)) } };
}

// ---------------------------------------------------------------- E7
// Locality: change blocks far away (a bar of A grown from 6 to 10 blocks)
// and count label differences near the far end x in [-1, 2].
function bar(len, regime) {
  const blocks = []; for (let x = 0; x < len; x++) blocks.push([x, 0, 0, A]);
  const { sim, o } = make(blocks, { dims: 2, ...regime });
  runLoop(sim, o);
  return sim;
}
function locality(regime) {
  const s6 = bar(6, regime), s10 = bar(10, regime);
  let diff = 0, cells = 0;
  for (let j = 0; j < s6.NY; j++) for (let i = 0; i < s6.NX; i++) {
    const x = s6.ox + (i + 0.5) / s6.n, y = s6.oy + (j + 0.5) / s6.n;
    if (x > 2) continue;
    cells++;
    const a = s6.label[j * s6.NX + i] ? 1 : 0, b = s10.label[cellAt(s10, x, y)] ? 1 : 0;
    if (a !== b) diff++;
  }
  const R = gaussKernel(regime.s ?? 0.2 * 32).R;
  return { regime, steps6: s6.steps, steps10: s10.steps, comparedCells: cells, differingCells: diff,
    kernelRadiusSubcells: R, reachPerStepBlocks: +(R / 32).toFixed(4), changeDistanceBlocks: 4 };
}

// ---------------------------------------------------------------- E8
// FID-k as TV-L1 (Chan & Esedoglu 2005): with the engine's costs a boundary
// cell keeps its phase while |kappa| <= k sqrt(2 pi) / s (2D, curve
// curvature; derivation in REPORT), so a convex corner of the blocks rounds
// to radius r = s / (k sqrt(2 pi)) (s in blocks). Measure the corner inset d
// along the diagonal of a 4x4-block square: r = d / (sqrt2 - 1).
function fidCorner({ k, n = 32, volume = false }) {
  const blocks = []; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) blocks.push([x, y, 0, A]);
  const { sim, o } = make(blocks, { dims: 2, n, anchor: { kind: 'fidelity', k }, volume, maxSteps: 300 });
  runLoop(sim, o);
  const p = phaseAtPoint(sim, 2, 2);
  // walk from the corner (4,4) inward along the diagonal until the first cell of phase p
  let d = null;
  for (let t = 0; t < 2; t += 0.25 / n) {
    const x = 4 - t / Math.SQRT2, y = 4 - t / Math.SQRT2;
    if (sim.label[cellAt(sim, x, y)] === p) { d = t; break; }
  }
  finish(sim, o);
  const sB = (o.s ?? 0.2 * o.n) / o.n;
  const rPred = sB / (k * Math.sqrt(2 * Math.PI));
  return { sim, res: { k, n, volume, steps: sim.steps, converged: !!sim.converged, measuredOn: 'labels',
    insetDiag: +d.toFixed(4), rMeasured: +(d / (Math.SQRT2 - 1)).toFixed(3), rPredicted: +rPred.toFixed(3),
    note: 'inset resolution about 0.5 sub-cell along the diagonal', lastChanges: sim.history.slice(-5) } };
}

// ---------------------------------------------------------------- main
const exp = process.argv[2];
const out = { experiment: exp, date: '2026-10-21', engine: 'lib/mbo.mjs (unchanged)', runs: [] };
const save = () => writeFileSync(HERE + `results-${exp}.json`, JSON.stringify(out, null, 1));
const t0 = performance.now();
if (exp === 'presplit') {
  for (const r of [0, 1, 2, 3, 4, 6, 8, 12, 16]) {
    const { sim, res } = abcd2D({ r });
    out.runs.push(res); save(); console.log(JSON.stringify(res));
    if ([0, 4, 8, 16].includes(r)) savePng(HERE + `img/abcd2d-presplit-r${r}.png`, renderSlice(sim, { axis: 2, at: 0.5, ppb: 60 }));
  }
} else if (exp === 'noise') {
  for (const [jitter, annealed] of [[1e-3, false], [1e-2, false], [1e-3, true], [1e-2, true], [3e-2, true], [1e-1, true]]) for (const seed of [1, 2, 3]) {
    const { sim, res } = abcd2D({ jitter, seed, annealed });
    out.runs.push(res); save(); console.log(JSON.stringify(res));
    if (seed === 1) savePng(HERE + `img/abcd2d-${annealed ? 'annealed' : 'frozen'}-j${jitter}-s${seed}.png`, renderSlice(sim, { axis: 2, at: 0.5, ppb: 60 }));
  }
} else if (exp === 'anneal') {
  for (const jitter of [0.03, 0.1]) for (const seed of [1, 2, 3, 4, 5]) {
    const { sim, res } = abcd2D({ jitter, seed, annealed: true, maxSteps: 100, quench: true });
    out.runs.push(res); save(); console.log(JSON.stringify(res));
    savePng(HERE + `img/abcd2d-anneal-quench-j${jitter}-s${seed}.png`, renderSlice(sim, { axis: 2, at: 0.5, ppb: 60 }));
  }
} else if (exp === 'abcd3d') {
  for (const [jitter, annealed, seed] of [[0, false, 1], [1e-3, false, 1], [1e-2, true, 1], [1e-2, true, 2]]) {
    const { sim, res } = abcd3D({ jitter, annealed, seed });
    out.runs.push(res); save(); console.log(JSON.stringify(res));
    savePng(HERE + `img/abcd3d-${annealed ? 'annealed' : 'frozen'}-j${jitter}-s${seed}.png`, renderSlice(sim, { axis: 1, at: 0.5, ppb: 60 }));
  }
} else if (exp === 'abcd3d-anneal') {
  for (const [jitter, seed] of [[0.1, 1], [0.1, 2], [0.1, 3]]) {
    const { sim, res } = abcd3D({ jitter, annealed: true, seed, maxSteps: 100, quench: true });
    out.runs.push(res); save(); console.log(JSON.stringify(res));
    savePng(HERE + `img/abcd3d-anneal-quench-j${jitter}-s${seed}.png`, renderSlice(sim, { axis: 1, at: 0.5, ppb: 60 }));
  }
} else if (exp === 'abcd3d-slices') {
  const { sim, res } = abcd3D({ jitter: 0.1, annealed: true, seed: 1, maxSteps: 100, quench: true });
  out.runs.push(res); save(); console.log(JSON.stringify(res));
  for (const at of [0.2, 0.8]) savePng(HERE + `img/abcd3d-anneal-quench-j0.1-s1-y${at}.png`, renderSlice(sim, { axis: 1, at, ppb: 60 }));
} else if (exp === 'neumann') {
  for (const n of [32, 64]) for (const g of [0.5, 1, 1.5]) {
    const { sim, res } = pairG({ g, n });
    out.runs.push(res); save(); console.log(JSON.stringify(res));
    if (n === 64) savePng(HERE + `img/pairdiff2d-g${g}-n${n}.png`, renderSlice(sim, { axis: 2, at: 0.5, ppb: 80 }));
  }
} else if (exp === 'fid') {
  for (const n of [32, 64]) for (const k of [0.1, 0.15, 0.3]) for (const volume of [false, true]) {
    const { sim, res } = fidCorner({ k, n, volume });
    out.runs.push(res); save(); console.log(JSON.stringify(res));
    if (n === 64 && !volume) savePng(HERE + `img/fid-square4-k${k}-n${n}.png`, renderSlice(sim, { axis: 2, at: 0.5, ppb: 40 }));
  }
} else if (exp === 'locality') {
  for (const regime of [
    { name: 'NOVOL-6', volume: false, maxSteps: 6, stopAfter: 99 },
    { name: 'FINITE-6', maxSteps: 6, stopAfter: 99 },
    { name: 'FID-0.15', anchor: { kind: 'fidelity', k: 0.15 }, maxSteps: 200 },
    { name: 'FID-0.15 novol', anchor: { kind: 'fidelity', k: 0.15 }, volume: false, maxSteps: 200 },
  ]) { const res = locality(regime); out.runs.push(res); save(); console.log(JSON.stringify(res)); }
} else throw new Error('unknown experiment ' + exp);
out.seconds = +((performance.now() - t0) / 1000).toFixed(1); save();
console.log('done', out.seconds, 's');
