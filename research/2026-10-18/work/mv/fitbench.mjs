// Fit-only benchmark: replay the fits requested on the bench chunks.
//   node fitbench.mjs ./pipeX.mjs ../../approaches/mv-X.mjs [R] [k=v...]
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const P = await import(process.argv[2]);
const optMod = await import(pathToFileURL(resolve(process.argv[3])).href);
const R = Number(process.argv[4] ?? 5);
const opt = { ...optMod.OPT };
for (const a of process.argv.slice(5)) { const [k, v] = a.split('='); opt[k] = Number(v); }
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const jobs = [];
for (const c of CHUNKS) {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: optMod.apron ?? 10 }).input;
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const A = inp.apron;
  const ctx = P.buildContext(inp, opt);
  ctx.log = [];
  for (let v = 0; v < m.V; v++) P.cornerPieces(ctx, m.corner[v * 3] + A, m.corner[v * 3 + 1] + A, m.corner[v * 3 + 2] + A, m.pos[v * 3] - m.corner[v * 3], m.pos[v * 3 + 2] - m.corner[v * 3 + 2]);
  for (const j of ctx.log) jobs.push([ctx, ...j]);
}
let best = Infinity;
const kinds = {};
for (let r = 0; r < R; r++) {
  const t0 = performance.now();
  for (const [ctx, mc, ci, k] of jobs) { const f = P.fitRaw(ctx, mc, ci, k); if (r === 0) { const kk = f ? f.kind : 'null'; kinds[kk] = (kinds[kk] ?? 0) + 1; } }
  best = Math.min(best, performance.now() - t0);
}
console.log(`${jobs.length} fits: ${(best / CHUNKS.length).toFixed(2)} ms per chunk, ${(1000 * best / jobs.length).toFixed(1)} µs per fit (min of ${R})`, JSON.stringify(kinds));
