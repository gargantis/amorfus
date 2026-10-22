// E9: look L3 / local L10 check on the shared engine: FID-0.15 with
// volume:false on single, pillar3, ring8 and a 1-thick 5x1x5 plate; final
// volume / blocks (labels). n 16 (plate n 12).
import { writeFileSync } from 'node:fs';
import { simulate, volumes } from '../../../lib/mbo.mjs';
import { byName } from '../../../lib/configs.mjs';
import { box, STONE, r4 } from './common.mjs';
const [out] = process.argv.slice(2);
const res = {};
for (const [name, blocks, n] of [['single', byName('single').blocks, 16], ['pillar3', byName('pillar3').blocks, 16], ['ring8', byName('ring8')?.blocks, 16], ['plate5x1x5', box(0, 0, 0, 5, 1, 5, STONE), 12], ['slab5x2x5', box(0, 0, 0, 5, 2, 5, STONE), 12]]) {
  if (!blocks) continue;
  for (const vol of [false, true]) {
    const sim = simulate(blocks, { anchor: { kind: 'fidelity', k: 0.15 }, volume: vol, n, maxSteps: 300 });
    const v = volumes(sim).reduce((a, q) => a + q.volume, 0);
    res[`${name}-${vol ? 'vol' : 'novol'}`] = { blocks: blocks.length, volume: r4(v), ratio: r4(v / blocks.length), steps: sim.steps, converged: !!sim.converged };
    console.log(name, vol ? 'vol' : 'novol', JSON.stringify(res[`${name}-${vol ? 'vol' : 'novol'}`]));
  }
}
writeFileSync(out, JSON.stringify(res, null, 1));
