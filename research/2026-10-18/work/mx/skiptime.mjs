import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { prep, computeCodes, buildTexels, skipBits, DEFAULTS } from './prod.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const data = CH.map((c) => { const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input; const P = prep(inp); const { codes } = computeCodes(P, { ...DEFAULTS, loneRound: true }); return { G: buildTexels(P, codes, 3), m: core.decodeMesh(core.meshRegion({ ...inp, params: {} })) }; });
const best = CH.map(() => Infinity);
let safe = 0, tris = 0;
for (let r = 0; r < 7; r++) data.forEach((d, i) => { const t0 = performance.now(); const res = skipBits(d.G, d.m, 0.5, 2); best[i] = Math.min(best[i], performance.now() - t0); if (r === 0) { safe += res.safeTris; tris += d.m.T; } });
console.log(`skip bits: mean ${(best.reduce((a, b) => a + b, 0) / CH.length).toFixed(2)} ms per chunk (min of 7), ${(100 * safe / tris).toFixed(1)}% of triangles safe`);
