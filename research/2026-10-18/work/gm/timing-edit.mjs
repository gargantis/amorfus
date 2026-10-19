// Edit-path cost (REMESH = 52³, apron 10): chunks with player edits inside
// them (painted lines/squares, placed planks, a dug pit), interleaved
// min-of-N, mesh() only (the same input object per approach).
//   node work/gm/timing-edit.mjs [N] a.mjs b.mjs …
import * as core from '../../harness/core.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { allEdits } from './edits.mjs';
import { loadMods } from './terrain-metrics.mjs';
const N = Number(process.argv[2]);
const mods = await loadMods(process.argv.slice(3));
const CASES = [
  [[0, 0, -3], ['paint-diag', 'paint-square']],
  [[-1, 1, 1], ['place-planks', 'dig-pit', 'paint-1:2']],
  [[-2, 1, 1], ['paint-diag', 'place-planks']],
  [[0, 0, 0], ['paint-square', 'paint-1:2']],
  [[-3, 1, 0], ['place-planks']],
  [[1, 1, 1], ['dig-pit']],
];
const inputs = CASES.map(([c, n]) => buildGenMeshInputGM([1, 1], ...c, allEdits(c[0], c[2], n), { forceApron: 10 }).input);
const best = mods.map(() => inputs.map(() => Infinity));
let stats = null;
for (let r = 0; r < N; r++) inputs.forEach((inp, ci) => mods.forEach((A, ai) => {
  const t0 = performance.now(); const m = A.mesh(inp, null, core); const t = performance.now() - t0;
  if (t < best[ai][ci]) best[ai][ci] = t;
  if (r === 0 && m.gmStats && A.name === 'gm-hint') { stats ??= []; stats.push(m.gmStats); }
}));
mods.forEach((A, ai) => { const xs = best[ai].slice().sort((a, b) => a - b); console.log(`${A.name.padEnd(14)} edited chunks (52³), min of ${N}: mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)} ms, median ${xs[xs.length >> 1].toFixed(2)} ms, max ${xs[xs.length - 1].toFixed(2)} ms`); });
if (stats) console.log('gm-hint per case: ' + stats.map((s) => `${s.fallbackQuads}/${s.genQuads + s.fallbackQuads} fallback quads, ${s.duplicated} dup, ${s.fans} fans`).join('; '));
