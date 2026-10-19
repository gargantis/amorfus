import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import * as P from './pipe2.mjs';
import * as M from '../../approaches/mv-v2.mjs';
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let fits = 0, distinct = 0, ys = 0, pieceCorners = 0, corners = 0;
for (const c of CHUNKS) {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input;
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const ctx = P.buildContext(inp, M.OPT);
  const A = inp.apron;
  const seen = new Set();
  const Ys = new Set();
  for (let v = 0; v < m.V; v++) {
    const key = `${m.corner[v * 3]},${m.corner[v * 3 + 1]},${m.corner[v * 3 + 2]}`;
    if (seen.has(key)) continue; seen.add(key);
    corners++;
    const pcs = P.cornerPieces(ctx, m.corner[v * 3] + A, m.corner[v * 3 + 1] + A, m.corner[v * 3 + 2] + A, m.pos[v * 3] - m.corner[v * 3], m.pos[v * 3 + 2] - m.corner[v * 3 + 2]);
    if (pcs.length) { pieceCorners++; Ys.add(m.corner[v * 3 + 1]); }
  }
  const xz = new Set();
  for (const k of ctx.fitCache.keys()) xz.add(k % (4096 * 4096 * 4));
  fits += ctx.fitCache.size; distinct += xz.size; ys += Ys.size;
}
const n = CHUNKS.length;
console.log(`per chunk: fits ${(fits / n).toFixed(0)}, distinct linels ${(distinct / n).toFixed(0)}, Y levels with pieces ${(ys / n).toFixed(1)}, corners ${(corners / n).toFixed(0)}, corners with pieces ${(pieceCorners / n).toFixed(0)}`);
