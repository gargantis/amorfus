import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const res = { 3: [], 6: [], 10: [] };
for (let rep = 0; rep < 6; rep++) for (const apron of [3, 6, 10]) {
  const t0 = performance.now();
  for (const c of CH) buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: apron });
  if (rep >= 2) res[apron].push((performance.now() - t0) / CH.length);
}
for (const a of [3, 6, 10]) { const v = res[a].sort((x, y) => x - y); console.log(`apron ${a} (${32 + 2 * a}³): median ${v[Math.floor(v.length / 2)].toFixed(1)} ms per chunk to generate (min ${v[0].toFixed(1)})`); }
