// Code-pass cost on the 16 bench chunks (GEN_MESH input, apron 10): min of N
// runs per chunk for prep, computeCodes and buildTexels; plus code counts.
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { prep, computeCodes, buildTexels, DEFAULTS } from './prod.mjs';
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const N = Number(process.argv[2] ?? 5);
const opts = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const inputs = CHUNKS.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input);
const best = CHUNKS.map(() => [Infinity, Infinity, Infinity]);
let st = null;
for (let r = 0; r < N; r++) {
  const agg = { coded: 0, windows: 0, ownerWindows: 0, crackFits: 0, crackMiss: 0, tauFallback: 0, overflow: 0 };
  inputs.forEach((inp, ci) => {
    const t0 = performance.now();
    const P = prep(inp);
    const t1 = performance.now();
    const { codes, stats } = computeCodes(P, { ...DEFAULTS, ...opts });
    const t2 = performance.now();
    buildTexels(P, codes, 3);
    const t3 = performance.now();
    const b = best[ci];
    b[0] = Math.min(b[0], t1 - t0); b[1] = Math.min(b[1], t2 - t1); b[2] = Math.min(b[2], t3 - t2);
    for (const k of Object.keys(agg)) agg[k] += stats[k];
  });
  st = agg;
}
const mean = (k) => best.reduce((a, b) => a + b[k], 0) / best.length;
const med = (k) => best.map((b) => b[k]).sort((a, b) => a - b)[best.length >> 1];
const mx = (k) => Math.max(...best.map((b) => b[k]));
console.log(`min of ${N}, 16 chunks: prep ${mean(0).toFixed(2)} ms, codes mean ${mean(1).toFixed(2)} / median ${med(1).toFixed(2)} / max ${mx(1).toFixed(2)} ms, texels ${mean(2).toFixed(2)} ms`);
console.log('per chunk:', Object.fromEntries(Object.entries(st).map(([k, v]) => [k, +(v / 16).toFixed(1)])));
