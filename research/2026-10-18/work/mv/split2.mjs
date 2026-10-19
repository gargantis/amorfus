// Stage timing of a pipeline (min of R reps per chunk): fits+assembly (cold),
// assembly (warm), slots. Usage: node split2.mjs ./pipeX.mjs ../../approaches/mv-X.mjs [R]
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const P = await import(process.argv[2]);
const optMod = await import(pathToFileURL(resolve(process.argv[3])).href);
const R = Number(process.argv[4] ?? 5);
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const opt = optMod.OPT;
const data = CHUNKS.map((c) => {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: optMod.apron ?? 10 }).input;
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const A = inp.apron, corners = [], seen = new Set();
  for (let v = 0; v < m.V; v++) {
    const key = `${m.corner[v * 3]},${m.corner[v * 3 + 1]},${m.corner[v * 3 + 2]}`;
    if (seen.has(key)) continue; seen.add(key);
    corners.push([m.corner[v * 3] + A, m.corner[v * 3 + 1] + A, m.corner[v * 3 + 2] + A, m.pos[v * 3] - m.corner[v * 3], m.pos[v * 3 + 2] - m.corner[v * 3 + 2], m.mat[v]]);
  }
  return { inp, corners };
});
const best = [Infinity, Infinity, Infinity].map(() => CHUNKS.map(() => Infinity));
let fits = 0, pcsN = 0;
for (let r = 0; r < R; r++) for (let ci = 0; ci < CHUNKS.length; ci++) {
  const { inp, corners } = data[ci];
  const t0 = performance.now();
  const ctx = P.buildContext(inp, opt);
  for (const [X, Y, Z, ox, oz] of corners) P.cornerPieces(ctx, X, Y, Z, ox, oz);
  const t1 = performance.now();
  const pcs = [];
  for (const [X, Y, Z, ox, oz] of corners) pcs.push(P.cornerPieces(ctx, X, Y, Z, ox, oz));
  const t2 = performance.now();
  for (let i = 0; i < corners.length; i++) { const [X, Y, Z, ox, oz, mat] = corners[i]; if (pcs[i].length) P.vertexSlots(ctx, pcs[i], mat, X, Y, Z, ox, oz); }
  const t3 = performance.now();
  best[0][ci] = Math.min(best[0][ci], t1 - t0); best[1][ci] = Math.min(best[1][ci], t2 - t1); best[2][ci] = Math.min(best[2][ci], t3 - t2);
  if (r === 0) { fits += ctx.stats.fits; pcsN += pcs.reduce((a, p) => a + p.length, 0); }
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const n = CHUNKS.length;
console.log(`per chunk (min of ${R}): cold fits+assembly ${mean(best[0]).toFixed(1)} ms (max ${Math.max(...best[0]).toFixed(1)}), warm assembly ${mean(best[1]).toFixed(1)} ms, slots ${mean(best[2]).toFixed(1)} ms; fits ${(fits / n).toFixed(0)}, pieces ${(pcsN / n).toFixed(0)}`);
