// Interleaved per-scene mesh timing over every harness scene, min of N.
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { meshRegion as lib } from '../../../lib/mesher.mjs';
import { meshRegion as gs } from '../mesher-gs.mjs';
import { params as pm } from '../../../approaches/gs-mls.mjs';
import { params as pc } from '../../../approaches/gs-ctx.mjs';
const N = 5;
const tot = { hints: 0, ctx: 0, mls: 0 };
const geo = { hints: 0, ctx: 0, mls: 0 };
for (const s of ALL_SCENES) {
  const region = core.buildRegion(s.cell, 10);
  const best = { hints: Infinity, ctx: Infinity, mls: Infinity };
  for (let i = 0; i < N + 1; i++) {
    for (const [k, f] of [['hints', () => lib({ ...region, params: {} })], ['ctx', () => gs({ ...region, params: pc })], ['mls', () => gs({ ...region, params: pm })]]) {
      const t0 = performance.now(); f(); const t = performance.now() - t0;
      if (i > 0 && t < best[k]) best[k] = t;
    }
  }
  for (const k of Object.keys(tot)) { tot[k] += best[k]; if (s.kind !== 'material') geo[k] += best[k]; }
}
console.log(`all ${ALL_SCENES.length} scenes (min of ${N}, interleaved): hints ${tot.hints.toFixed(0)} ms, gs-ctx ${tot.ctx.toFixed(0)} ms, gs-mls ${tot.mls.toFixed(0)} ms; edited/geometry+constraint scenes only: hints ${geo.hints.toFixed(0)}, gs-ctx ${geo.ctx.toFixed(0)}, gs-mls ${geo.mls.toFixed(0)} ms`);
