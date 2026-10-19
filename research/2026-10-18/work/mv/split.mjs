// Split v2 annotate time: fits vs piece assembly vs slots (warm-cache second pass).
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const pipePath = process.argv[2] ?? './pipe2.mjs';
const P = await import(pipePath);
const optMod = await import(pathToFileURL(resolve(process.argv[3] ?? 'approaches/mv-v2.mjs')).href);
const CHUNKS = [
  [-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2],
  [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1],
];
const opt = optMod.OPT;
let tA = 0, tB = 0, tC = 0, nFits = 0, nCorners = 0, nPieces = 0;
for (let rep = 0; rep < 2; rep++) for (const c of CHUNKS) {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input;
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const A = inp.apron;
  const corners = [];
  const seen = new Set();
  for (let v = 0; v < m.V; v++) {
    const key = `${m.corner[v * 3]},${m.corner[v * 3 + 1]},${m.corner[v * 3 + 2]}`;
    if (seen.has(key)) continue; seen.add(key);
    corners.push([m.corner[v * 3] + A, m.corner[v * 3 + 1] + A, m.corner[v * 3 + 2] + A, m.pos[v * 3] - m.corner[v * 3], m.pos[v * 3 + 2] - m.corner[v * 3 + 2], m.mat[v]]);
  }
  const ctx = P.buildContext(inp, opt);
  let t0 = performance.now();
  for (const [X, Y, Z, ox, oz] of corners) P.cornerPieces(ctx, X, Y, Z, ox, oz);
  let t1 = performance.now();
  const pcs = [];
  for (const [X, Y, Z, ox, oz] of corners) pcs.push(P.cornerPieces(ctx, X, Y, Z, ox, oz));
  let t2 = performance.now();
  for (let i = 0; i < corners.length; i++) { const [X, Y, Z, ox, oz, mat] = corners[i]; if (pcs[i].length) P.vertexSlots(ctx, pcs[i], mat, X, Y, Z, ox, oz); }
  let t3 = performance.now();
  if (rep === 1) { tA += t1 - t0; tB += t2 - t1; tC += t3 - t2; nFits += ctx.stats.fits; nCorners += corners.length; nPieces += pcs.reduce((a, p) => a + p.length, 0); }
}
const n = CHUNKS.length;
console.log(`per chunk: first pass (fits+assembly) ${(tA / n).toFixed(1)} ms, warm assembly ${(tB / n).toFixed(1)} ms, slots ${(tC / n).toFixed(1)} ms; fits ${(nFits / n).toFixed(0)}, corners ${(nCorners / n).toFixed(0)}, pieces ${(nPieces / n).toFixed(0)}`);
