import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { buildScenarios, SEED } from '../gh/editscenes.mjs';
import { prep, computeCodes, buildTexels, DEFAULTS } from './prod.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const sc = buildScenarios();
const sets = { terrain: CH.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input), edits: ['mountain', 'town', 'single'].map((s) => buildGenMeshInput(SEED, ...sc[s].chunks[0], sc[s].edits, { forceApron: 10 }).input) };
const N = Number(process.argv[2] ?? 5);
for (const [name, inputs] of Object.entries(sets)) {
  let best = null;
  for (let r = 0; r < N; r++) {
    const ph = { prep: 0, fill: 0, fit1: 0, pass2: 0, total: 0, texels: 0 };
    for (const inp of inputs) {
      const t0 = performance.now(); const P = prep(inp); const t1 = performance.now();
      const { codes } = computeCodes(P, { ...DEFAULTS, loneRound: true, phase: ph }); const t2 = performance.now();
      buildTexels(P, codes, 3); const t3 = performance.now();
      ph.prep += t1 - t0; ph.total += t3 - t0; ph.texels += t3 - t2;
    }
    if (!best || ph.total < best.total) best = ph;
  }
  const n = inputs.length;
  const scan = best.total - best.prep - best.texels - best.fill - best.fit1 - best.pass2;
  console.log(`${name} (${n} chunks, best of ${N}) per chunk: total ${(best.total / n).toFixed(2)} ms = prep ${(best.prep / n).toFixed(2)} + scan ${(scan / n).toFixed(2)} + fill ${(best.fill / n).toFixed(2)} + own-crack fits ${(best.fit1 / n).toFixed(2)} + assembly/owner windows ${(best.pass2 / n).toFixed(2)} + texels ${(best.texels / n).toFixed(2)}`);
}
