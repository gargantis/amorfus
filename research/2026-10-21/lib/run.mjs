// Run configurations under one regime and save images + numbers.
//   node lib/run.mjs <outDir> <regimeJSON> [name,name,…|all] [--no-view] [--no-slice] [--before]
// regimeJSON: options for mbo.simulate, e.g. '{"anchor":{"kind":"cage","r":0.25}}'.
// Writes <outDir>/<name>-view.png (after), <name>-slice.png (cross-section
// after), <name>-blocks.png (cross-section before), with --before also
// <name>-before.png (the starting blocks, same camera), and merges
// <outDir>/results.json by name. Views are framed on the blocks' bounds, so
// every regime of one configuration has the same scale.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { simulate, volumes, setup, finish, DEFAULTS } from './mbo.mjs';
import { renderView, renderSlice, blocksSlice, savePng } from './render.mjs';
import { CONFIGS } from './configs.mjs';

export function blockBounds(blocks) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of blocks) for (let t = 0; t < 3; t++) { min[t] = Math.min(min[t], b[t]); max[t] = Math.max(max[t], b[t] + 1); }
  return { min, max };
}

/** The starting blocks rendered through the same pipeline (no steps). */
export function beforeSim(blocks, regime = {}) {
  const o = { ...DEFAULTS, ...regime, anchor: null };
  return finish(setup(blocks, o), o);
}

export function runOne(cfg, regime, outDir, { view = true, slice = true, before = false } = {}) {
  const t0 = performance.now();
  const sim = simulate(cfg.blocks, regime);
  const ms = performance.now() - t0;
  mkdirSync(outDir, { recursive: true });
  const bounds = blockBounds(cfg.blocks);
  const vopts = { bounds, ...(cfg.viewOpts ?? {}) };
  if (view && sim.dims === 3) savePng(join(outDir, `${cfg.name}-view.png`), renderView(sim, vopts));
  if (before && sim.dims === 3) savePng(join(outDir, `${cfg.name}-before.png`), renderView(beforeSim(cfg.blocks, regime), vopts));
  const sl = sim.dims === 2 ? { axis: 2, at: 0.5 } : cfg.slice;
  if (slice && sl) {
    savePng(join(outDir, `${cfg.name}-slice.png`), renderSlice(sim, sl));
    savePng(join(outDir, `${cfg.name}-blocks.png`), blocksSlice(cfg.blocks, sim, sl));
  }
  return {
    name: cfg.name, desc: cfg.desc, ms: Math.round(ms), steps: sim.steps, converged: !!sim.converged,
    lastChanges: sim.history.slice(-5), grid: [sim.NX, sim.NY, sim.NZ], n: sim.n,
    phases: volumes(sim).map((v) => ({ ...v, volume: +v.volume.toFixed(3), lambda: +sim.phases[v.p].lambda.toFixed(4) })),
    clustersStart: sim.phases.length - 1,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outDir, regimeJSON, names = 'all', ...flags] = process.argv.slice(2);
  const regime = JSON.parse(regimeJSON);
  const pick = names === 'all' ? CONFIGS : names.split(',').map((n) => {
    const c = CONFIGS.find((k) => k.name === n);
    if (!c) throw new Error(`no config ${n}`);
    return c;
  });
  const resPath = join(outDir, 'results.json');
  const results = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')) : { regime, runs: {} };
  for (const cfg of pick) {
    const r = runOne(cfg, regime, outDir, {
      view: !flags.includes('--no-view'), slice: !flags.includes('--no-slice'), before: flags.includes('--before'),
    });
    results.runs[cfg.name] = r;
    console.log(`${cfg.name}: ${r.ms} ms, ${r.steps} steps${r.converged ? '' : ' (not converged)'}, phases ${r.phases.map((p) => `${p.mat}:${p.blocks}→${p.volume}`).join(' ')}`);
    writeFileSync(resPath, JSON.stringify(results, null, 1));
  }
}

