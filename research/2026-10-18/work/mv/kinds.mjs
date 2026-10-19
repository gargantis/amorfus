// Count pointel fit kinds and timing on the bench terrain chunks.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import * as fit2d from './fit2d.mjs';
import { buildContext, cornerPieces } from './pipeline.mjs';
import * as ap from '../../approaches/mv-fit.mjs';
const CHUNKS = [
  [-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2],
  [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1],
];
const opt = { ...ap.OPT, W: 7 };
const kinds = {};
let fits = 0, ys = 0;
for (const c of CHUNKS) {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input;
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const out = ap.annotate(m, inp, opt);
  // the fit cache of the last context is not exported; re-run with a context
}
// direct: count kinds via a context built for each chunk
for (const c of CHUNKS) {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input;
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const ctx = buildContext(inp, opt);
  const A = inp.apron;
  for (let v = 0; v < m.V; v++) {
    const X = m.corner[v * 3] + A, Y = m.corner[v * 3 + 1] + A, Z = m.corner[v * 3 + 2] + A;
    cornerPieces(ctx, X, Y, Z, m.pos[v * 3] + A, m.pos[v * 3 + 2] + A);
  }
  for (const f of ctx.fitCache.values()) { const k = f ? f.kind : 'null'; kinds[k] = (kinds[k] ?? 0) + 1; fits++; }
  ys += ctx.region ? 0 : 0;
}
console.log('fits', fits, 'per chunk', (fits / CHUNKS.length).toFixed(0), kinds);
