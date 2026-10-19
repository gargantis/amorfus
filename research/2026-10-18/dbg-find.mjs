import { buildGenMeshInput } from './lib/gen-mesh.mjs';
import * as core from './harness/core.mjs';
const SEED = [1, 1];
const rows = [];
for (let cx = -3; cx <= 2; cx++) for (let cz = -3; cz <= 2; cz++) for (let cy = -1; cy <= 2; cy++) {
  const { input } = buildGenMeshInput(SEED, cx, cy, cz, new Map(), { forceApron: 10 });
  const m = core.decodeMesh(core.meshRegion(input));
  if (m.quadCount === 0) continue;
  // up-facing material mix and height range
  const counts = new Map();
  let ylo = 99, yhi = -99;
  for (let t = 0; t < m.T; t++) {
    const fn = core.faceNormal(m, t);
    if (fn[1] < 0.5) continue;
    const a = m.tri[t * 3];
    counts.set(m.mat[a], (counts.get(m.mat[a]) ?? 0) + 1);
    ylo = Math.min(ylo, m.pos[a * 3 + 1]); yhi = Math.max(yhi, m.pos[a * 3 + 1]);
  }
  const mix = [...counts].sort((a, b) => b[1] - a[1]);
  const second = mix[1]?.[1] ?? 0;
  rows.push({ c: [cx, cy, cz], mix: mix.map(([k, v]) => `${core.MATERIAL_NAMES[k]}:${v}`).join(' '), second, relief: +(yhi - ylo).toFixed(1), quads: m.quadCount });
}
rows.sort((a, b) => b.second - a.second);
for (const r of rows.slice(0, 10)) console.log(JSON.stringify(r));
