// Verifier v-look runner.
//   node --max-old-space-size=700 src/vrun.mjs <REGIME> <n> <names|all> [--img] [--margin m] [--jitter j] [--seed s] [--tag t]
// Writes res/<REGIME>@n<n>[<tag>].json (merged by scene) and, with --img,
// img/<REGIME>@n<n>[<tag>]/<scene>-view.png, -slice.png, -sec.png.
// Candidate regimes use the look team's engine copy UNCHANGED
// (teams/look/src/mbo-look.mjs, imported read-only); the others use lib/mbo.mjs.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, setup, finish, DEFAULTS } from '../../../lib/mbo.mjs';
import { simulate as simulateLook } from '../../look/src/mbo-look.mjs';
import { renderView, renderSlice, savePng } from '../../../lib/render.mjs';
import { blockBounds } from '../../../lib/run.mjs';
import * as LM from '../../look/src/lm.mjs';
import * as V from './vm.mjs';
import { ALLV, sceneByName } from './scenes.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const fl = (v, n) => Math.floor(v * n + 1e-9) / n;

// Candidate family. V0 = vertical cap 0 (as the candidates are defined);
// V05 = the exact PLAN §7.4 vertical cap 0.05; horizontal cap = 0.15 floored
// to whole sub-cells (n 16: 0.125, exactly the look team's value; n 20: 0.15;
// n 24: 0.125). Core eroded by 0.25 stays solid (as in the look team's runs).
const cand = (k, vcap) => (n) => ({ engine: 'look', anchor: { kind: 'fidelity', k, kMat: 0.02, box: { outH: fl(0.15, n), outV: vcap ? fl(0.05, n) : 0, inH: 0.25, inV: 0.25 } } });
export const REGIMES = {
  BLOCKS: () => null,
  'C10-V0': cand(0.1, false), 'C15-V0': cand(0.15, false),
  'C10-V05': cand(0.1, true), 'C15-V05': cand(0.15, true),
  // paint fidelity raised (does the band survive / does flooding stop?)
  'C15-V0-km05': (n) => ({ ...cand(0.15, false)(n), anchor: { ...cand(0.15, false)(n).anchor, kMat: 0.05 } }),
  'C15-V0-km10': (n) => ({ ...cand(0.15, false)(n), anchor: { ...cand(0.15, false)(n).anchor, kMat: 0.10 } }),
  'FID-0.15': () => ({ anchor: { kind: 'fidelity', k: 0.15 } }),
  'FID-0.1': () => ({ anchor: { kind: 'fidelity', k: 0.1 } }),
  'FID-0.2': () => ({ anchor: { kind: 'fidelity', k: 0.2 } }),
  'FID-0.25': () => ({ anchor: { kind: 'fidelity', k: 0.25 } }),
  'FINITE-1': () => ({ maxSteps: 1, stopAfter: 99 }),
  'FINITE-2': () => ({ maxSteps: 2, stopAfter: 99 }),
  'CAGE-0.15': () => ({ anchor: { kind: 'cage', r: 0.15 } }),
  'FID-0.15-g0.5': () => ({ anchor: { kind: 'fidelity', k: 0.15 }, g: 0.5 }),
  'FID-0.15-g1.5': () => ({ anchor: { kind: 'fidelity', k: 0.15 }, g: 1.5 }),
  'FINITE-4': () => ({ maxSteps: 4, stopAfter: 99 }),
  'CAGE-0.25': () => ({ anchor: { kind: 'cage', r: 0.25 } }),
  'CAGE-0.05': () => ({ anchor: { kind: 'cage', r: 0.05 } }),
  'NOVOL-1': () => ({ volume: false, maxSteps: 1, stopAfter: 99 }),
  'NOVOL-2': () => ({ volume: false, maxSteps: 2, stopAfter: 99 }),
  'NOVOL-3': () => ({ volume: false, maxSteps: 3, stopAfter: 99 }),
  'NOVOL-4': () => ({ volume: false, maxSteps: 4, stopAfter: 99 }),
  FREE: () => ({ maxSteps: 300 }),
};

const r2 = Math.SQRT1_2;
function measure(cfg, sim) {
  const r = {};
  const F = LM.fields(sim);
  switch (cfg.name) {
    case 'tunnel':
      r.open = Object.fromEntries([0.75, 1.5, 2.25].map((z) => [z, V.opening(sim, z, 2.0, 0.5, 2.5, 0.7, 1.9)]));
      r.lookClearCells = Object.fromEntries([0.75, 1.5, 2.25].map((z) => [z, LM.tunnelClearCells(sim, z, 2.0, 0.5, 2.5)]));
      r.flatTop = V.flatTop(sim, 0.75, 2.25, 0.75, 2.25, 4, 4.5);
      break;
    case 'room2':
      r.open = Object.fromEntries([0.25, 0.5, 1.0, 1.5, 1.75].map((z) => [z, V.opening(sim, z, 2.0, 0.5, 3.5, 1.7, 1.9)]));
      r.flatTop = V.flatTop(sim, 0.75, 3.25, 0.75, 2.25, 4, 4.5);
      break;
    case 'trench': case 'trench-gd':
      r.gap = Object.fromEntries([1.0, 2.0].map((z) => [z, V.gapRows(sim, z, 3.5, 1.06, 2.0)]));
      r.floor = V.flatTop(sim, 3.3, 3.7, 0.75, 3.25, 1, 1.9);
      r.flatL = V.flatTop(sim, 0.75, 2.25, 0.75, 3.25, 2, 2.5);
      r.flatR = V.flatTop(sim, 4.75, 6.25, 0.75, 3.25, 2, 2.5);
      if (cfg.name === 'trench-gd') r.grass = V.paintStats(sim, 0, 7, 0, 4, 2.5, 1);
      break;
    case 'pillar3': {
      let mn = Infinity;
      for (let y = 0.5 / sim.n; y < 3; y += 1 / sim.n) for (const d of [[1, 0, 0], [0, 0, 1]]) mn = Math.min(mn, V.extent(sim, [0.5, y, 0.5], d));
      r.widthMin = mn; r.widthMid = V.extent(sim, [0.5, 1.5, 0.5], [1, 0, 0]); r.height = V.extent(sim, [0.5, 1.5, 0.5], [0, 1, 0]);
      r.diagMid = V.extent(sim, [0.5, 1.5, 0.5], [1, 0, 1]);
      break;
    }
    case 'single':
      r.ext = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((d) => V.extent(sim, [0.5, 0.5, 0.5], d));
      r.diag = V.extent(sim, [0.5, 0.5, 0.5], [1, 1, 1]);
      r.diagOverAxis = +(r.diag / Math.max(...r.ext)).toFixed(4); // cube 1.732, sphere 1.0
      r.corner = LM.cornerInset(F.lab, [0.5, 0.5, 0.5], [1, 1, 1]);
      r.edge = LM.edgeRound(F.lab, [0.5, 0.5, 0.5], 0, 1, 0.5);
      break;
    case 'cube2-same':
      r.corner = LM.cornerInset(F.lab, [1, 1, 1], [2, 2, 2]);
      r.edge = LM.edgeRound(F.lab, [1, 1, 1], 0, 1, 1);
      r.cornerD = LM.cornerInset(F.D, [1, 1, 1], [2, 2, 2]);
      r.faceTop = V.flatTop(sim, 0.4, 1.6, 0.4, 1.6, 2, 2.5);
      break;
    case 'sq2-same':
      r.thickness = V.extent(sim, [1, 0.5, 1], [0, 1, 0]);
      r.cornerPlan = LM.cornerInset(F.lab, [1, 0.5, 1], [2, 0.5, 2]);
      r.flatTop = V.flatTop(sim, 0.5, 1.5, 0.5, 1.5, 1, 1.5);
      break;
    case 'terrain-step':
      r.flatLow = V.flatTop(sim, 0.75, 2.25, 0.75, 4.25, 2, 3.5);
      r.flatHigh = V.flatTop(sim, 3.75, 5.25, 0.75, 4.25, 3, 3.5);
      r.grass = V.paintStats(sim, 0, 6, 0, 5, 3.5, 1);
      break;
    case 'stairs':
      r.treads = [0, 1, 2].map((i) => V.flatTop(sim, i + 0.3, i + 0.7, 0.5, 1.5, i + 1, 3.5));
      break;
    case 'ring8': {
      const c = (x, y, z) => sim.label[((Math.floor((z - sim.oz) * sim.n)) * sim.NY + Math.floor((y - sim.oy) * sim.n)) * sim.NX + Math.floor((x - sim.ox) * sim.n)];
      r.holeOpenAtCentre = !c(1.5, 0.5, 1.5);
      let w = 0; for (let x = 1.5; x < 2.5 && !c(x, 0.5, 1.5); x += 1 / sim.n) w += 1 / sim.n;
      let w2 = 0; for (let x = 1.5 - 1 / sim.n; x > 0.5 && !c(x, 0.5, 1.5); x -= 1 / sim.n) w2 += 1 / sim.n;
      r.holeWidthX = r.holeOpenAtCentre ? +(w + w2).toFixed(4) : 0;
      r.flatTop = V.flatTop(sim, 0.25, 0.75, 0.25, 2.75, 1, 1.5);
      break;
    }
    case 'slab-line': case 'slab2-line': {
      const top = cfg.name === 'slab-line' ? 1 : 2, yMax = top + 0.5;
      r.band = V.lineWidth(sim, [0, 0], [r2, r2], 1.5 * Math.SQRT2, 4.5 * Math.SQRT2, yMax, 6);
      r.bandEnd0 = V.lineWidth(sim, [0, 0], [r2, r2], 0.25 * Math.SQRT2, 1.0 * Math.SQRT2, yMax, 6);
      r.bandEnd1 = V.lineWidth(sim, [0, 0], [r2, r2], 5.0 * Math.SQRT2, 5.75 * Math.SQRT2, yMax, 6);
      r.lookBandTop = LM.bandWidth(sim, 6, 1.5 * Math.SQRT2, 4.5 * Math.SQRT2, { mode: 'top', yTop: yMax });
      r.paint = V.paintStats(sim, 0, 6, 0, 6, yMax, 6);
      r.junctions = [1, 2, 3, 4, 5].map((k) => LM.junction(sim, k, 6, 7, top - 1 + 0.05, top + 0.6)).join('');
      r.flatB = [V.flatTop(sim, 3.6, 5.4, 0.6, 1.6, top, yMax), V.flatTop(sim, 0.6, 1.6, 3.6, 5.4, top, yMax)];
      r.Abelow = V.matBelow(sim, 6, top - 1);
      for (const k of ['band', 'bandEnd0', 'bandEnd1']) delete r[k].prof;
      break;
    }
    case 'slab-dot': case 'slab2-dot': {
      const top = cfg.name === 'slab-dot' ? 1 : 2, yMax = top + 0.5;
      r.paint = V.paintStats(sim, 0, 5, 0, 5, yMax, 6);
      r.flat = V.flatTop(sim, 0.6, 1.4, 0.6, 4.4, top, yMax);
      r.Abelow = V.matBelow(sim, 6, top - 1);
      break;
    }
    case 'slab-stripe': case 'slab2-stripe': {
      const top = cfg.name === 'slab-stripe' ? 1 : 2, yMax = top + 0.5;
      const L = (a, b) => { const w = V.lineWidth(sim, [2.5, 0], [0, 1], a, b, yMax, 6); delete w.prof; return w; };
      r.mid = L(1.5, 4.5); r.end0 = L(0.0, 0.75); r.end1 = L(5.25, 6.0);
      r.paint = V.paintStats(sim, 0, 6, 0, 6, yMax, 6);
      r.flat = V.flatTop(sim, 4.0, 5.4, 0.6, 5.4, top, yMax);
      r.Abelow = V.matBelow(sim, 6, top - 1);
      break;
    }
    case 'diag2': {
      const L = (a, b) => { const w = V.lineWidth(sim, [0.5, 0], [r2, r2], a, b, 2.5, 6, 2); delete w.prof; return w; };
      r.mid = L(1.5 * Math.SQRT2, 4 * Math.SQRT2); r.end0 = L(0.25 * Math.SQRT2, 1.0 * Math.SQRT2);
      r.paint = V.paintStats(sim, 0, 6, 0, 6, 2.5, 6);
      r.Abelow = V.matBelow(sim, 6, 1);
      break;
    }
    case 'Lturn': {
      const L = (P0, u, a, b) => { const w = V.lineWidth(sim, P0, u, a, b, 2.5, 6); delete w.prof; return w; };
      r.leg1 = L([0, 1.5], [1, 0], 1.75, 3.25); r.leg2 = L([4.5, 0], [0, 1], 2.75, 4.25);
      r.end1 = L([0, 1.5], [1, 0], 1.0, 1.5); r.end2 = L([4.5, 0], [0, 1], 4.5, 5.0);
      r.paint = V.paintStats(sim, 0, 6, 0, 6, 2.5, 6);
      break;
    }
    case 'cross': {
      const L = (P0, u, a, b) => { const w = V.lineWidth(sim, P0, u, a, b, 2.5, 6); delete w.prof; return w; };
      r.arm = L([3.5, 0], [0, 1], 0.75, 2.25); r.armB = L([0, 3.5], [1, 0], 4.75, 6.25);
      r.paint = V.paintStats(sim, 0, 7, 0, 7, 2.5, 6);
      r.Abelow = V.matBelow(sim, 6, 1);
      break;
    }
    case 'xdiag': {
      const L = (P0, u, a, b) => { const w = V.lineWidth(sim, P0, u, a, b, 2.5, 6); delete w.prof; return w; };
      r.arm = L([0, 0], [r2, r2], 0.75 * Math.SQRT2, 2.25 * Math.SQRT2);
      r.paint = V.paintStats(sim, 0, 7, 0, 7, 2.5, 6);
      r.phasesA = V.phaseCounts(sim)[6];
      break;
    }
    case 'checker2': case 'checker1': {
      const top = cfg.name === 'checker2' ? 2 : 1;
      r.paint = V.paintStats(sim, 0, 6, 0, 6, top + 0.5, 6);
      r.paintB = V.paintStats(sim, 0, 6, 0, 6, top + 0.5, 7);
      r.Abelow = V.matBelow(sim, 6, top - 1);
      break;
    }
    case 'text-AZ':
      r.paint = V.paintStats(sim, 0, 9, 0, 7, 2.5, 6);
      r.Abelow = V.matBelow(sim, 6, 1);
      break;
    case 'stripe-alone': case 'stripe-patch': {
      const L = (a, b) => { const w = V.lineWidth(sim, [0, 2.5], [1, 0], a, b, 2.5, 6); delete w.prof; return w; };
      r.stripeMid = L(1.0, 4.5); r.stripeFreeEnd = L(0.0, 0.5); r.stripeNearPatch = L(4.5, 5.75);
      r.paint = V.paintStats(sim, 0, 9, 0, 5, 2.5, 6);
      r.Abelow = V.matBelow(sim, 6, 1);
      break;
    }
    case 'big2-line': {
      const L = (a, b) => { const w = V.lineWidth(sim, [0, 0], [r2, r2], a * Math.SQRT2, b * Math.SQRT2, 2.5, 6); delete w.prof; return w; };
      r.band = L(3, 7); r.bandEnd0 = L(2.0, 2.75); r.bandEnd1 = L(7.25, 8.0);
      r.paint = V.paintStats(sim, 0, 10, 0, 10, 2.5, 6);
      r.junctions = [3, 4, 5, 6, 7].map((k) => LM.junction(sim, k, 6, 7, 1.05, 2.6)).join('');
      r.Abelow = V.matBelow(sim, 6, 1);
      break;
    }
    case 'big2-checker':
      r.paint = V.paintStats(sim, 0, 10, 0, 10, 2.5, 6);
      r.paintB = V.paintStats(sim, 3, 7, 3, 7, 2.5, 7);
      r.Abelow = V.matBelow(sim, 6, 1);
      break;
    case 'step-line': {
      r.band = V.lineWidth(sim, [0, 0], [r2, r2], 0.5 * Math.SQRT2, 5.5 * Math.SQRT2, 3.5, 6);
      r.bandProf = r.band.prof.filter((_, i) => i % 4 === 0); delete r.band.prof;
      r.paintLow = V.paintStats(sim, 0, 3, 0, 6, 3.5, 6); r.paintHigh = V.paintStats(sim, 3, 6, 0, 6, 3.5, 6);
      r.flatLow = V.flatTop(sim, 0.6, 1.4, 3.6, 5.4, 2, 3.5); r.flatHigh = V.flatTop(sim, 4.6, 5.4, 0.6, 2.4, 3, 3.5);
      break;
    }
    case 'slab-halves':
      r.flatA = V.flatTop(sim, 0.75, 2.0, 0.75, 5.25, 1, 1.5); r.flatB = V.flatTop(sim, 4.0, 5.25, 0.75, 5.25, 1, 1.5);
      r.seamCol = V.flatTop(sim, 2.75, 3.25, 0.75, 5.25, 1, 1.5);
      break;
    case 'L3-ABC': case 'sq2-checker': {
      let bc = 0;
      const m = (c) => V.matOf(sim, sim.label[c]);
      for (let c = 0; c < sim.N - 1; c++) { const a = m(c), b = m(c + 1); if ((a === 7 && b === 1) || (a === 1 && b === 7)) bc++; }
      r.BCcontactsX = bc;
      if (cfg.name === 'sq2-checker') r.junction = LM.junction(sim, 1, 6, 7);
      break;
    }
    default:
  }
  return r;
}

const round = (v) => (typeof v === 'number' ? +v.toFixed(4) : Array.isArray(v) ? v.map(round) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v);

export function runScene(regName, n, cfg, { img = false, margin = null, jitter = 0, seed = 1, tag = '' } = {}) {
  const mk = REGIMES[regName];
  if (!mk) throw new Error(`no regime ${regName}`);
  const reg = mk(n);
  const t0 = performance.now();
  let sim;
  const base = { n, ...(margin != null ? { margin } : {}), ...(jitter ? { jitter, seed } : {}) };
  if (reg === null) { const o = { ...DEFAULTS, ...base }; o.s = 0.2 * n; sim = finish(setup(cfg.blocks, o), o); sim.steps = 0; sim.converged = true; sim.history = []; }
  else { const { engine, ...opts } = reg; sim = engine === 'look' ? simulateLook(cfg.blocks, { ...opts, ...base }) : simulate(cfg.blocks, { ...opts, ...base }); }
  const ms = Math.round(performance.now() - t0);
  const out = {
    regime: regName, opts: reg, n, margin: margin ?? 1, jitter, seed, steps: sim.steps, converged: !!sim.converged, ms,
    lastChanges: sim.history.slice(-4), cells: sim.N, ...V.shapeChange(sim), vol: V.vols(sim), phases: V.phaseCounts(sim),
    lambdas: sim.phases.map((P, p) => (p && P.alive ? +P.lambda.toFixed(4) : null)).filter((v) => v != null).slice(0, 12),
    ...measure(cfg, sim),
  };
  if (img) {
    const dir = join(HERE, 'img', `${regName}@n${n}${tag}`);
    mkdirSync(dir, { recursive: true });
    const bounds = blockBounds(cfg.blocks);
    savePng(join(dir, `${cfg.name}-view.png`), renderView(sim, { bounds, width: 360, height: 270 }));
    if (cfg.slice) savePng(join(dir, `${cfg.name}-slice.png`), renderSlice(sim, { ...cfg.slice, ppb: 40 }));
    if (cfg.sec) savePng(join(dir, `${cfg.name}-sec.png`), renderSlice(sim, { ...cfg.sec, ppb: 40 }));
  }
  return { out: round(out), sim };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [regName, nStr, names = 'all', ...flags] = process.argv.slice(2);
  const n = +nStr;
  const opt = (k, d) => { const i = flags.indexOf(k); return i >= 0 ? flags[i + 1] : d; };
  const img = flags.includes('--img');
  const margin = opt('--margin', null) != null ? +opt('--margin') : null;
  const jitter = +opt('--jitter', 0), seed = +opt('--seed', 1), tag = opt('--tag', '');
  const resPath = join(HERE, 'res', `${regName}@n${n}${tag}.json`);
  const results = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')) : { regime: regName, n, runs: {} };
  const pick = names === 'all' ? ALLV : names.split(',').map((q) => { const c = sceneByName(q); if (!c) throw new Error(`no scene ${q}`); return c; });
  for (const cfg of pick) {
    const { out } = runScene(regName, n, cfg, { img, margin, jitter, seed, tag });
    results.runs[cfg.name] = out;
    writeFileSync(resPath, JSON.stringify(results, null, 1));
    console.log(`${regName}@n${n}${tag} ${cfg.name}: ${out.ms} ms, ${out.steps} st${out.converged ? '' : ' nc'}, cells ${out.cells}, d ${out.delta}, rss ${Math.round(process.memoryUsage().rss / 1e6)} MB`);
  }
}
