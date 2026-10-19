import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import * as P from './pipe5.mjs';
import * as M from '../../approaches/mv-v5.mjs';
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const data = CHUNKS.map((c) => {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input;
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const Ys = new Set();
  for (let v = 0; v < m.V; v++) Ys.add(m.corner[v * 3 + 1] + inp.apron);
  return { inp, Ys: [...Ys] };
});
let best = CHUNKS.map(() => [Infinity, Infinity, Infinity]);
for (let r = 0; r < 5; r++) data.forEach(({ inp, Ys }, i) => {
  const t0 = performance.now();
  const ctx = P.buildContext(inp, M.OPT);
  const t1 = performance.now();
  for (const Y of Ys) ctx.mcAt(Y);
  const t2 = performance.now();
  ctx.star.ensure();
  const t3 = performance.now();
  best[i] = [Math.min(best[i][0], t1 - t0), Math.min(best[i][1], t2 - t1), Math.min(best[i][2], t3 - t2)];
});
const mean = (k) => best.reduce((a, b) => a + b[k], 0) / best.length;
console.log(`context ${mean(0).toFixed(2)} ms, per-Y maps ${mean(1).toFixed(2)} ms (${(data.reduce((a, d) => a + d.Ys.length, 0) / data.length).toFixed(1)} levels), M* chains ${mean(2).toFixed(2)} ms`);
