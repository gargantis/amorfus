// Generator cost of the material planes: v1 (no planes) vs v1 + the planes
// gm-hint needs (sQ Int16 per column + dQ Int8 per block) vs all planes
// (+ Int16 D for gm-slope), interleaved min-of-N over the 16 bench chunks
// at 38³ (apron 3) and 52³ (apron 10).
import { generateRegionV1, generateRegionHint, generateRegionGM } from './gen-gm.mjs';
import { BENCH } from './terrain-metrics.mjs';
const N = Number(process.argv[2] ?? 9);
const fns = { 'v1 (production)': generateRegionV1, 'v1 + S,D8 planes (gm-hint)': generateRegionHint, 'v1 + S,D8,D16 planes (gm-slope)': generateRegionGM };
for (const apron of [3, 10]) {
  const n = 32 + 2 * apron;
  const best = Object.keys(fns).map(() => BENCH.map(() => Infinity));
  for (let r = 0; r < N; r++) BENCH.forEach((c, ci) => Object.values(fns).forEach((f, fi) => {
    const t0 = performance.now(); f([1, 1], c[0] * 32 - apron, c[1] * 32 - apron, c[2] * 32 - apron, n, n, n); const t = performance.now() - t0;
    if (t < best[fi][ci]) best[fi][ci] = t;
  }));
  Object.keys(fns).forEach((k, fi) => { const xs = best[fi].slice().sort((a, b) => a - b); console.log(`${n}³ ${k.padEnd(34)} min of ${N}: mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)} ms, median ${xs[xs.length >> 1].toFixed(2)} ms`); });
}
