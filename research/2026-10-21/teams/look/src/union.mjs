// Team "look": do same-material blocks that touch only along an edge or at a
// corner unite? node --max-old-space-size=700 src/union.mjs <REGIME,REGIME,…>
// Variants: jitter 0 (seed 1) and jitter 1e-3 with seeds 1, 2, 3.
// Writes results/union-<REGIME>.json and plan slices (jitter 1e-3, seed 1).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../../lib/mbo.mjs';
import { renderSlice, renderView, savePng } from '../../../lib/render.mjs';
import { byName } from '../../../lib/configs.mjs';
import { blockBounds } from '../../../lib/run.mjs';
import { REGIMES } from './sweep.mjs';
import * as M from './lm.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CFGS = ['diag-edge', 'diag-corner', 'sq2-checker', 'slab-line'];
const VARIANTS = [{ jitter: 0, seed: 1 }, { jitter: 1e-3, seed: 1 }, { jitter: 1e-3, seed: 2 }, { jitter: 1e-3, seed: 3 }];

for (const regName of process.argv[2].split(',')) {
  const reg = REGIMES[regName];
  if (!reg) throw new Error(`regime ${regName} has no options (BLOCKS is not a dynamic regime)`);
  const out = { regime: regName, options: reg, runs: {} };
  const imgDir = join(HERE, 'img', 'union', regName);
  mkdirSync(imgDir, { recursive: true });
  for (const name of CFGS) {
    const cfg = byName(name);
    out.runs[name] = [];
    for (const v of VARIANTS) {
      const t0 = performance.now();
      const sim = simulate(cfg.blocks, { ...reg, ...v });
      const ms = Math.round(performance.now() - t0);
      const start = M.startCounts(sim), end = M.phaseCounts(sim);
      const r = { ...v, steps: sim.steps, converged: !!sim.converged, ms, start, end };
      if (name === 'sq2-checker') r.junction = M.junction(sim, 1, 6, 7);
      if (name === 'diag-edge') r.junction = M.junction(sim, 1, 6, 0);
      if (name === 'slab-line') r.junctions = [1, 2, 3, 4, 5].map((k) => M.junction(sim, k, 6, 7)).join('');
      // united = fewer live phases of material A (6) than at the start
      r.unitedA = (end[6] ?? 0) < (start[6] ?? 0);
      r.unitedB = (end[7] ?? 0) < (start[7] ?? 0);
      out.runs[name].push(r);
      if (v.jitter && v.seed === 1) {
        const sl = name === 'diag-corner' ? { axis: 2, at: 1.0 } : { axis: 1, at: 0.5 };
        savePng(join(imgDir, `${name}-slice.png`), renderSlice(sim, { ...sl, ppb: 40 }));
        savePng(join(imgDir, `${name}-view.png`), renderView(sim, { bounds: blockBounds(cfg.blocks), width: 320, height: 240 }));
      }
      console.log(`${regName} ${name} j${v.jitter} s${v.seed}: ${ms} ms ${sim.steps} steps, ${JSON.stringify(start)}→${JSON.stringify(end)} ${r.junction ?? r.junctions ?? ''}`);
    }
  }
  writeFileSync(join(HERE, 'results', `union-${regName}.json`), JSON.stringify(out, null, 1));
}
