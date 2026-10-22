// FREE regime over the whole catalogue (+ a few extra configurations for
// the pattern tests). One configuration per invocation, so memory is freed:
//   node --max-old-space-size=700 freecat.mjs <name> [n] [seeds=1,2] [--no-img]
// Regime: FREE = { maxSteps: 400, jitter: 1e-3, seed } (defaults otherwise:
// s = 0.2 n, margin 1, g 1, eps 0.05, volume true, merge true).
// Writes free/<name>-s<seed>-{view,slice}.png, free/<name>-{before,blocks}.png,
// and merges free/results.json[name][seed].
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { CONFIGS, A, B, C } from '../../lib/configs.mjs';
import { renderView, renderSlice, blocksSlice, savePng } from '../../lib/render.mjs';
import { blockBounds, beforeSim } from '../../lib/run.mjs';
import { simulateKeep, components, junctionCensus, facePoints } from './labtools.mjs';

const plan = (rows) => { const M = { A, B, C }; const out = []; rows.forEach((row, z) => [...row].forEach((ch, x) => { if (M[ch]) out.push([x, 0, z, M[ch]]); })); return out; };
const PLAN = { axis: 1, at: 0.5 };
export const EXTRA = [
  { name: 'row-AAB', desc: 'row A A B (A2|B1, same as L3-AAB)', blocks: plan(['AAB']), slice: PLAN },
  { name: 'row-ABB', desc: 'row A B B (A1|B2)', blocks: plan(['ABB']), slice: PLAN },
  { name: 'L-ABB', desc: 'L: A, B corner, B (A1|B2 bent)', blocks: plan(['AB', '.B']), slice: PLAN },
  { name: 'row-AAAB', desc: 'row A A A B (A3|B1, same as sq2-AAAB)', blocks: plan(['AAAB']), slice: PLAN },
  { name: 'row-AABB', desc: 'row A A B B (A2|B2, same as sq2-AABB)', blocks: plan(['AABB']), slice: PLAN },
  { name: 'checker-smallA', desc: 'unequal checkerboard: single A blocks on one diagonal, 2-block B clusters on the other', blocks: plan(['ABB', 'BA.', 'B..']), slice: PLAN },
  { name: 'checker-smallB', desc: 'as checker-smallA with materials swapped', blocks: plan(['BAA', 'AB.', 'A..']), slice: PLAN },
  { name: 'L3-ABA', desc: 'L tromino, B in the corner, two A arms touching along an edge', blocks: plan(['BA', 'A.']), slice: PLAN },
];
const ALL = [...CONFIGS, ...EXTRA];

const [name, nArg, seedsArg = '1,2', ...flags] = process.argv.slice(2);
const cfg = ALL.find((c) => c.name === name);
if (!cfg) throw new Error(`no config ${name}`);
const n = nArg ? +nArg : 16;
const seeds = seedsArg.split(',').map(Number);
const dir = new URL('./free/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const resPath = `${dir}results.json`;
const bounds = blockBounds(cfg.blocks);
const vopts = { bounds, ...(cfg.viewOpts ?? {}) };
const out = {};
for (const seed of seeds) {
  const regime = { n, maxSteps: 400, jitter: 1e-3, seed };
  const sim = simulateKeep(cfg.blocks, regime);
  const alive = sim.phases.map((P, p) => (p && P.alive ? p : 0)).filter(Boolean);
  const phases = alive.map((p) => {
    let cnt = 0; for (let c = 0; c < sim.N; c++) if (sim.label[c] === p) cnt++;
    return { p, mat: sim.phases[p].mat, blocks: sim.phases[p].blocks, volume: +(cnt / sim.cellVol).toFixed(3), lambda: +sim.lambdaRun[p].toFixed(4), comps: components(sim, p).length };
  });
  const contacts = [];
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
    const ar = facePoints(sim, alive[i], alive[j]).length / (n * n);
    if (ar > 0) contacts.push({ a: alive[i], b: alive[j], mats: [sim.phases[alive[i]].mat, sim.phases[alive[j]].mat], faceArea: +ar.toFixed(3) });
  }
  const cen = junctionCensus(sim);
  const r = {
    regime, steps: sim.steps, converged: !!sim.converged, ms: Math.round(sim.ms), grid: [sim.NX, sim.NY, sim.NZ],
    lastChanges: sim.history.slice(-5), clustersStart: sim.phases.length - 1, phasesEnd: alive.length, phases, contacts,
    census: { hist: cen.hist, quadComponents: cen.quad.length, quadMaxExtent: cen.quad.length ? cen.quad[0].extent : 0, quadTop: cen.quad.slice(0, 5) },
  };
  out[seed] = r;
  console.log(`${name} seed ${seed}: ${r.steps} steps${r.converged ? '' : ' (nc)'} ${r.ms} ms; phases ${phases.map((p) => `${p.mat}:${p.blocks}->${p.volume}${p.comps > 1 ? `[${p.comps} parts!]` : ''}`).join(' ')}; quad ${r.census.quadComponents} max ext ${r.census.quadMaxExtent}`);
  if (!flags.includes('--no-img')) {
    savePng(`${dir}${name}-s${seed}-view.png`, renderView(sim, vopts));
    if (cfg.slice) savePng(`${dir}${name}-s${seed}-slice.png`, renderSlice(sim, cfg.slice));
    if (seed === seeds[0]) {
      savePng(`${dir}${name}-before.png`, renderView(beforeSim(cfg.blocks, regime), vopts));
      if (cfg.slice) savePng(`${dir}${name}-blocks.png`, blocksSlice(cfg.blocks, sim, cfg.slice));
    }
  }
}
const all = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')) : {};
all[name] = { desc: cfg.desc, n, blocks: cfg.blocks.length, ...(all[name] ?? {}), runs: { ...(all[name]?.runs ?? {}), ...out } };
writeFileSync(resPath, JSON.stringify(all, null, 1));
