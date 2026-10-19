// Interleaved timing on the bench chunks (noise-robust relative cost).
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const names = process.argv.slice(2);
const mods = await Promise.all(names.map((n) => import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href)));
const inputs = mods.map((M) => CH.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: M.apron ?? 10 }).input));
const ms = mods.map(() => []), tris = mods.map(() => 0);
for (let rep = 0; rep < 3; rep++) for (let i = 0; i < CH.length; i++) for (let k = 0; k < mods.length; k++) {
  const t0 = performance.now();
  const m = mods[k].mesh(inputs[k][i], null, core);
  ms[k].push(performance.now() - t0);
  if (rep === 0) tris[k] += m.T;
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (let k = 0; k < mods.length; k++) console.log(`${names[k].padEnd(10)} apron ${mods[k].apron ?? 10}: median ${med(ms[k]).toFixed(1)} ms, mean ${(ms[k].reduce((a, b) => a + b, 0) / ms[k].length).toFixed(1)} ms per chunk; ${(tris[k] / CH.length).toFixed(0)} triangles per chunk`);
