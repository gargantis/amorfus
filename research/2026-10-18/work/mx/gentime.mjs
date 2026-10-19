// Interleaved min-of-N cost of generation (GEN_MESH region) and the hints
// mesher at aprons 3 (today's unedited path, 38³), 6 (mf-iso, 44³), 9 and 10 (52³).
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import * as core from '../../harness/core.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const N = Number(process.argv[2] ?? 7);
const AP = [3, 6, 9, 10];
const g = {}, m = {};
for (const a of AP) { g[a] = CH.map(() => Infinity); m[a] = CH.map(() => Infinity); }
for (let r = 0; r < N; r++) for (let ci = 0; ci < CH.length; ci++) for (const a of AP) {
  const c = CH[ci];
  const t0 = performance.now();
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: a }).input;
  const t1 = performance.now();
  core.meshRegion({ ...inp, params: {} });
  const t2 = performance.now();
  g[a][ci] = Math.min(g[a][ci], t1 - t0); m[a][ci] = Math.min(m[a][ci], t2 - t1);
}
const mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
const med = (x) => x.slice().sort((p, q) => p - q)[x.length >> 1];
for (const a of AP) console.log(`apron ${a} (${32 + 2 * a}³): generate mean ${mean(g[a]).toFixed(2)} / median ${med(g[a]).toFixed(2)} ms; hints mesh mean ${mean(m[a]).toFixed(2)} / median ${med(m[a]).toFixed(2)} ms (min of ${N})`);
