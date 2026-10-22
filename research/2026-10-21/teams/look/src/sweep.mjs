// Team "look": run one regime over the catalogue, render, measure.
//   node --max-old-space-size=700 src/sweep.mjs <REGIME> <names|all> [--no-img]
// Writes results/<REGIME>.json (merged by config), img/<REGIME>/<cfg>-view.png,
// -slice.png (and -sec.png where a second cut helps), labels/<REGIME>/<cfg>.bin.gz.
// REGIME "BLOCKS" renders and measures the starting blocks (no steps).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, setup, finish, DEFAULTS } from '../../../lib/mbo.mjs';
import { simulate as simulateLook } from './mbo-look.mjs';
import { renderView, renderSlice, savePng } from '../../../lib/render.mjs';
import { blockBounds } from '../../../lib/run.mjs';
import { ALL } from './configs-look.mjs';
import * as M from './lm.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');

export const REGIMES = {
  BLOCKS: null,
  'FID-0.4': { anchor: { kind: 'fidelity', k: 0.4 } },
  'FID-0.25': { anchor: { kind: 'fidelity', k: 0.25 } },
  'FID-0.15': { anchor: { kind: 'fidelity', k: 0.15 } },
  'FID-0.1': { anchor: { kind: 'fidelity', k: 0.1 } },
  'FID-0.05': { anchor: { kind: 'fidelity', k: 0.05 } },
  'FID-0.15-g0.5': { anchor: { kind: 'fidelity', k: 0.15 }, g: 0.5 },
  'FID-0.15-g1.5': { anchor: { kind: 'fidelity', k: 0.15 }, g: 1.5 },
  'CAGE-0.15': { anchor: { kind: 'cage', r: 0.15 } },
  'CAGE-0.25': { anchor: { kind: 'cage', r: 0.25 } },
  'CAGE-0.4': { anchor: { kind: 'cage', r: 0.4 } },
  'FINITE-2': { maxSteps: 2, stopAfter: 99 },
  'FINITE-4': { maxSteps: 4, stopAfter: 99 },
  'FINITE-8': { maxSteps: 8, stopAfter: 99 },
  FREE: { maxSteps: 300 },
  // ---- beyond the mission's list: engine copy src/mbo-look.mjs (engine: 'look') ----
  // NV = volume not kept (no bubble pressure); BOX = the surface may grow into
  // air at most 0.125 horizontally / 0.0625 vertically (2 and 1 sub-cells: the
  // nearest to PLAN §7.4's 0.15 / 0.05 at n 16) and the blocks eroded by 0.25
  // always stay solid; PAINT = paint moves inside the solid at fidelity kMat.
  'NV-FID-0.1': { engine: 'look', volume: false, anchor: { kind: 'fidelity', k: 0.1 } },
  'NV-FID-0.15': { engine: 'look', volume: false, anchor: { kind: 'fidelity', k: 0.15 } },
  'NV-FID-0.25': { engine: 'look', volume: false, anchor: { kind: 'fidelity', k: 0.25 } },
  'BOX-FID-0.15': { engine: 'look', anchor: { kind: 'fidelity', k: 0.15, box: { outH: 0.125, outV: 0.0625, inH: 0.25, inV: 0.25 } } },
  'BOX-FID-0.1': { engine: 'look', anchor: { kind: 'fidelity', k: 0.1, box: { outH: 0.125, outV: 0.0625, inH: 0.25, inV: 0.25 } } },
  'BOX-PAINT-0.15-0': { engine: 'look', anchor: { kind: 'fidelity', k: 0.15, kMat: 0, box: { outH: 0.125, outV: 0.0625, inH: 0.25, inV: 0.25 } } },
  'BOX-PAINT-0.1-0.02': { engine: 'look', anchor: { kind: 'fidelity', k: 0.1, kMat: 0.02, box: { outH: 0.125, outV: 0.0625, inH: 0.25, inV: 0.25 } } },
  // BOX0: as BOX but no vertical growth into air at all (outV 0), stricter than PLAN §7.4's 0.05
  'BOX0-FID-0.15': { engine: 'look', anchor: { kind: 'fidelity', k: 0.15, box: { outH: 0.125, outV: 0, inH: 0.25, inV: 0.25 } } },
  'BOX0-PAINT-0.15-0.02': { engine: 'look', anchor: { kind: 'fidelity', k: 0.15, kMat: 0.02, box: { outH: 0.125, outV: 0, inH: 0.25, inV: 0.25 } } },
  'BOX0-PAINT-0.1-0.02': { engine: 'look', anchor: { kind: 'fidelity', k: 0.1, kMat: 0.02, box: { outH: 0.125, outV: 0, inH: 0.25, inV: 0.25 } } },
  'BOX-NV-FID-0.1': { engine: 'look', volume: false, anchor: { kind: 'fidelity', k: 0.1, box: { outH: 0.125, outV: 0.0625, inH: 0.25, inV: 0.25 } } },
  'BOX-NV-FID-0.15': { engine: 'look', volume: false, anchor: { kind: 'fidelity', k: 0.15, box: { outH: 0.125, outV: 0.0625, inH: 0.25, inV: 0.25 } } },
  'BOX-PAINT-0.15-0.02': { engine: 'look', anchor: { kind: 'fidelity', k: 0.15, kMat: 0.02, box: { outH: 0.125, outV: 0.0625, inH: 0.25, inV: 0.25 } } },
  'BOX-NV-PAINT-0.1-0.02': { engine: 'look', volume: false, anchor: { kind: 'fidelity', k: 0.1, kMat: 0.02, box: { outH: 0.125, outV: 0.0625, inH: 0.25, inV: 0.25 } } },
  // resolution checks of the shared engine (same s = 0.2 block)
  'FID-0.25@n24': { n: 24, anchor: { kind: 'fidelity', k: 0.25 } },
  'FID-0.15@n24': { n: 24, anchor: { kind: 'fidelity', k: 0.15 } },
  'FID-0.1@n24': { n: 24, anchor: { kind: 'fidelity', k: 0.1 } },
  'FINITE-4@n24': { n: 24, maxSteps: 4, stopAfter: 99 },
  'CAGE-0.25@n24': { n: 24, anchor: { kind: 'cage', r: 0.25 } },
  'FID-0.25@n20': { n: 20, anchor: { kind: 'fidelity', k: 0.25 } },
  'FID-0.15@n20': { n: 20, anchor: { kind: 'fidelity', k: 0.15 } },
  'FID-0.15@n12': { n: 12, anchor: { kind: 'fidelity', k: 0.15 } },
  'FID-0.25@n12': { n: 12, anchor: { kind: 'fidelity', k: 0.25 } },
  // the PLAN §7.4 caps exactly (n 20: 0.15 = 3 sub-cells, 0.05 = 1)
  'BOX20-FID-0.15': { engine: 'look', n: 20, anchor: { kind: 'fidelity', k: 0.15, box: { outH: 0.15, outV: 0.05, inH: 0.25, inV: 0.25 } } },
  'BOX20-PAINT-0.15-0.02': { engine: 'look', n: 20, anchor: { kind: 'fidelity', k: 0.15, kMat: 0.02, box: { outH: 0.15, outV: 0.05, inH: 0.25, inV: 0.25 } } },
};

// Slices: [main, second] (null = none). Axis 1 = plan, axis 2 = x–y section.
const SLICES = {
  'cube2-same': [{ axis: 2, at: 1.0 }, null],
  'cube2-oneB': [{ axis: 2, at: 1.5 }, { axis: 1, at: 1.5 }],
  'slab-halves': [{ axis: 2, at: 3.0 }, { axis: 1, at: 0.5 }],
  'slab-stripe': [{ axis: 1, at: 0.5 }, { axis: 2, at: 3.0 }],
  'slab-dot': [{ axis: 1, at: 0.5 }, { axis: 2, at: 2.5 }],
  'slab-line': [{ axis: 1, at: 0.5 }, { axis: 2, at: 2.5 }],
  'sq2-AABB': [{ axis: 1, at: 0.5 }, { axis: 0, at: 1.0 }],
  'sq2-same': [{ axis: 1, at: 0.5 }, { axis: 0, at: 1.0 }],
  'pair-same': [{ axis: 1, at: 0.5 }, null],
  'pair-diff': [{ axis: 1, at: 0.5 }, null],
};

export function measure(cfg, sim) {
  const F = M.fields(sim);
  const both = (fn) => ({ lab: fn(F.lab), D: fn(F.D) });
  const r = {};
  switch (cfg.name) {
    case 'single':
      r.extent = both((f) => [0, 1, 2].map((a) => M.extentThrough(f, [0.5, 0.5, 0.5], a)));
      r.edge = both((f) => M.edgeRound(f, [0.5, 0.5, 0.5], 0, 1, 0.5));
      r.corner = both((f) => M.cornerInset(f, [0.5, 0.5, 0.5], [1, 1, 1]));
      break;
    case 'pair-same':
      r.extent = both((f) => [0, 1, 2].map((a) => M.extentThrough(f, [1, 0.5, 0.5], a)));
      break;
    case 'cube2-same':
      r.edge = both((f) => M.edgeRound(f, [1, 1, 1], 0, 1, 1));
      r.corner = both((f) => M.cornerInset(f, [1, 1, 1], [2, 2, 2]));
      break;
    case 'sq2-same':
      r.edgePlan = both((f) => M.edgeRound(f, [1, 0.5, 1], 0, 2, 1));
      r.edgeSection = both((f) => M.edgeRound(f, [1, 0.5, 1.5], 2, 1, 0.5));
      r.corner = both((f) => M.cornerInset(f, [1.5, 0.5, 1.5], [2, 1, 2]));
      r.thickness = both((f) => M.extentThrough(f, [1, 0.5, 1], 1));
      break;
    case 'pillar3': {
      r.widthMid = both((f) => M.extentThrough(f, [0.5, 1.5, 0.5], 0));
      r.height = both((f) => M.extentThrough(f, [0.5, 1.5, 0.5], 1));
      r.widthMin = both((f) => {
        let m = Infinity;
        for (let y = 0.5; y <= 2.5 + 1e-9; y += 0.1) for (const a of [0, 2]) { const e = M.extentThrough(f, [0.5, y, 0.5], a); if (e != null) m = Math.min(m, e); else m = Math.min(m, 0); }
        return m;
      });
      break;
    }
    case 'tunnel':
      r.clear = both((f) => M.tunnelClear(f, 1.5, 2.0, 0.5, 2.5));
      r.clearCells = Object.fromEntries([0.75, 1.5, 2.25].map((z) => [z, M.tunnelClearCells(sim, z, 2.0, 0.5, 2.5)]));
      r.widthMid = both((f) => (f(1.5, 2, 1.5) > 0 ? 0 : M.extentThrough(f, [1.5, 2, 1.5], 0)));
      r.heightMid = both((f) => (f(1.5, 2, 1.5) > 0 ? 0 : M.extentThrough(f, [1.5, 2, 1.5], 1)));
      r.floor = both((f) => { const c = f(1.5, 2, 1.5) > 0 ? null : M.crossing(f, [1.5, 2, 1.5], [0, -1, 0], 3); return c ? c.p[1] : null; });
      r.roof = both((f) => { const c = f(1.5, 2, 1.5) > 0 ? null : M.crossing(f, [1.5, 2, 1.5], [0, 1, 0], 3); return c ? c.p[1] : null; });
      break;
    case 'terrain-step': {
      const o = { yTop: 4.5, yBot: -0.5 };
      r.topLowCentre = both((f) => M.topY(f, 1.5, 2.5, 4.5, -0.5) - 2);
      r.topHighCentre = both((f) => M.topY(f, 4.5, 2.5, 4.5, -0.5) - 3);
      r.flatLow = both((f) => M.flatness(f, M.grid2(0.75, 2.25, 0.75, 4.25), 2, o));
      r.flatHigh = both((f) => M.flatness(f, M.grid2(3.75, 5.25, 0.75, 4.25), 3, o));
      break;
    }
    case 'slab-dot': {
      const o = { yTop: 2, yBot: -1 };
      const keep = (x, z) => !(x > 1.25 && x < 3.75 && z > 1.25 && z < 3.75);
      r.flatTop = both((f) => M.flatness(f, M.grid2(0.75, 4.25, 0.75, 4.25, 0.125, keep), 1, o));
      r.flatBot = both((f) => M.flatness(f, M.grid2(0.75, 4.25, 0.75, 4.25, 0.125, keep), 0, { ...o, bottom: true }));
      r.dotTopY = both((f) => M.topY(f, 2.5, 2.5, 2, -1) - 1);
      // A run length on the top surface along x through the dot centre
      let cnt = 0;
      for (let x = 0; x <= 5; x += 1 / 128) { let mat = 0; for (let y = 1.6; y > -0.5; y -= 1 / sim.n) { const q = M.matAt(sim, x, y, 2.5); if (q) { mat = q; break; } } if (mat === 6) cnt++; }
      r.dotTopExtentX_lab = cnt / 128;
      break;
    }
    case 'slab-stripe': {
      const o = { yTop: 2, yBot: -1 };
      r.flatTopB = both((f) => M.flatness(f, M.grid2(3.75, 5.25, 0.75, 5.25), 1, o));
      r.flatBotB = both((f) => M.flatness(f, M.grid2(3.75, 5.25, 0.75, 5.25), 0, { ...o, bottom: true }));
      r.stripeTop = both((f) => { const ys = []; for (let z = 1; z <= 5; z += 0.25) ys.push(M.topY(f, 2.5, z, 2, -1) - 1); return { min: Math.min(...ys), max: Math.max(...ys) }; });
      r.seamGroove = both((f) => { const g = M.groove(f, 3, 3, 1, { flatL: [3.9, 4.6], flatR: [4.0, 5.25], yTop: 2, yBot: -1 }); delete g.profile; return g; });
      break;
    }
    case 'slab-halves': {
      const o = { yTop: 2, yBot: -1 };
      r.groove = both((f) => M.groove(f, 3, 3, 1, { flatL: [0.75, 2.0], flatR: [4.0, 5.25], yTop: 2, yBot: -1 }));
      r.flatTop = both((f) => M.flatness(f, [...M.grid2(0.75, 2.0, 0.75, 5.25), ...M.grid2(4.0, 5.25, 0.75, 5.25)], 1, o));
      r.flatBot = both((f) => M.flatness(f, [...M.grid2(0.75, 2.0, 0.75, 5.25), ...M.grid2(4.0, 5.25, 0.75, 5.25)], 0, { ...o, bottom: true }));
      break;
    }
    case 'sq2-AABB': {
      const sw = (f) => (x, y, z) => f(z, y, x); // across the seam = z
      r.groove = both((f) => { const g = M.groove(sw(f), 1, 1, 1, { flatL: [0.35, 0.65], flatR: [1.35, 1.65], yTop: 2, yBot: -1, windows: [[0.06, 0.25]] }); delete g.profile; return g; });
      break;
    }
    case 'slab-line': {
      const s0 = Math.SQRT2 * 1.5, s1 = Math.SQRT2 * 4.5;
      r.bandTop = M.bandWidth(sim, 6, s0, s1, { mode: 'top' });
      r.bandMid = M.bandWidth(sim, 6, s0, s1, { mode: 'mid', y: 0.5 });
      const keep = (x, z) => Math.abs(x - z) / Math.SQRT2 >= 1.6;
      r.flatTopB = both((f) => M.flatness(f, M.grid2(0.75, 5.25, 0.75, 5.25, 0.125, keep), 1, { yTop: 2, yBot: -1 }));
      // which diagonal pair is connected through each of the five X junctions (x = z = k)
      r.junctions = [1, 2, 3, 4, 5].map((k) => M.junction(sim, k, 6, 7)).join('');
      break;
    }
    case 'stairs':
      r.treads = both((f) => [0, 1, 2].map((i) => M.topY(f, i + 0.5, 1, 4.5, -0.5) - (i + 1)));
      break;
    case 'ring8':
      r.holeAirAtCentre = M.matAt(sim, 1.5, 0.5, 1.5) === 0;
      r.holeWidthX = both((f) => (f(1.5, 0.5, 1.5) > 0 ? 0 : M.extentThrough(f, [1.5, 0.5, 1.5], 0)));
      r.holeWidthDiag = both((f) => { if (f(1.5, 0.5, 1.5) > 0) return 0; const a = M.crossing(f, [1.5, 0.5, 1.5], [1, 0, 1], 3), b = M.crossing(f, [1.5, 0.5, 1.5], [-1, 0, -1], 3); return a && b ? a.t + b.t : null; });
      break;
    default:
  }
  return r;
}

const round = (v) => (typeof v === 'number' ? +v.toFixed(4) : Array.isArray(v) ? v.map(round) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v);

export function runRegime(regName, names, { img = true } = {}) {
  const reg = REGIMES[regName];
  if (reg === undefined) throw new Error(`no regime ${regName}`);
  const outImg = join(HERE, 'img', regName), outLab = join(HERE, 'labels', regName);
  mkdirSync(outImg, { recursive: true }); mkdirSync(outLab, { recursive: true });
  const resPath = join(HERE, 'results', `${regName}.json`);
  const results = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')) : { regime: regName, options: reg, engine: reg?.engine === 'look' ? 'src/mbo-look.mjs (copy of lib/mbo.mjs + box/kMat), s 0.2·n, jitter 0' : 'lib/mbo.mjs (unchanged), s 0.2·n, jitter 0', n: reg?.n ?? 16, runs: {} };
  const pick = names === 'all' ? ALL : names.split(',').map((n) => { const c = ALL.find((k) => k.name === n); if (!c) throw new Error(`no config ${n}`); return c; });
  for (const cfg of pick) {
    const t0 = performance.now();
    let sim;
    if (reg === null) { const o = { ...DEFAULTS }; sim = finish(setup(cfg.blocks, o), o); sim.steps = 0; sim.converged = true; sim.history = []; }
    else { const { engine, ...opts } = reg; sim = engine === 'look' ? simulateLook(cfg.blocks, opts) : simulate(cfg.blocks, opts); }
    const ms = performance.now() - t0;
    const t1 = performance.now();
    const meas = measure(cfg, sim);
    const generic = {
      steps: sim.steps, converged: !!sim.converged, ms: Math.round(ms), lastChanges: sim.history.slice(-4),
      grid: [sim.NX, sim.NY, sim.NZ], cells: sim.N,
      shapeChange: M.shapeChange(sim), vol: M.volumeErrors(sim),
      phasesStart: M.startCounts(sim), phasesEnd: M.phaseCounts(sim),
      lambdas: sim.phases.map((P, p) => (p && P.alive ? +P.lambda.toFixed(4) : null)).filter((v) => v != null),
    };
    const msMeasure = Math.round(performance.now() - t1);
    if (img) {
      const bounds = blockBounds(cfg.blocks);
      savePng(join(outImg, `${cfg.name}-view.png`), renderView(sim, { bounds, width: 320, height: 240 }));
      const [s1, s2] = SLICES[cfg.name] ?? [cfg.slice ?? null, null];
      if (s1) savePng(join(outImg, `${cfg.name}-slice.png`), renderSlice(sim, { ...s1, ppb: 40 }));
      if (s2) savePng(join(outImg, `${cfg.name}-sec.png`), renderSlice(sim, { ...s2, ppb: 40 }));
    }
    writeFileSync(join(outLab, `${cfg.name}.bin.gz`), gzipSync(Buffer.from(sim.label.buffer)));
    results.runs[cfg.name] = round({ ...generic, msMeasure, ...meas });
    writeFileSync(resPath, JSON.stringify(results, null, 1));
    console.log(`${regName} ${cfg.name}: ${generic.ms} ms, ${generic.steps} steps${generic.converged ? '' : ' (nc)'}, Δ ${generic.shapeChange.toFixed(3)}, phases ${JSON.stringify(generic.phasesStart)}→${JSON.stringify(generic.phasesEnd)}, rss ${Math.round(process.memoryUsage().rss / 1e6)} MB`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [regName, names = 'all', ...flags] = process.argv.slice(2);
  runRegime(regName, names, { img: !flags.includes('--no-img') });
}
