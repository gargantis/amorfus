// Apron sensitivity for per-quad slot data: for each triangle, the slot bytes
// of its three vertices at apron A vs a reference apron. Chunks: the 16 bench
// chunks and the seams.mjs world's chunks.   node work/mv/apron2.mjs <module> A [ref]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { AIR, GRASS, DIRT, STONE, SAND, PLANKS } from '../../harness/core.mjs';
const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
const A = Number(process.argv[3] ?? 10), REF = Number(process.argv[4] ?? 16);
// the seams.mjs world
const h = (x, z) => 9 + 4 * Math.exp(-((x - 30) ** 2 + (z - 34) ** 2) / (2 * 7 ** 2)) + 0.6 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
const plan = (x, z) => {
  if (Math.hypot(x + 0.5 - 31.2, z + 0.5 - 30.4) < 4.3) return STONE;
  if (z + 0.5 > 0.5 * (x + 0.5) + 30.7) return SAND;
  if (x - z === 6 && x > 20 && x < 44) return STONE;
  return GRASS;
};
const world = (x, y, z) => {
  if (Math.hypot(x + 0.5 - 33, y + 0.5 - 12, z + 0.5 - 12) < 5.2 && y >= 12) return { v: PLANKS, edited: true };
  if (z >= 40 && z < 48 && x >= 24 && x < 40 && y >= 12 && y + 0.5 < 12 + (x + 0.5 - 24) / 4) return { v: STONE, edited: true };
  if (Math.hypot(x + 0.5 - 40, y + 0.5 - 13, z + 0.5 - 31) < 4 && y < 13) return { v: AIR, edited: true };
  const d = h(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  return { v: depth <= 1 ? plan(x, z) : depth <= 4 ? DIRT : STONE, rho: clampRho(d) };
};
const inputs = [];
for (const c of [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]]) inputs.push([`bench ${c}`, (ap) => buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: ap }).input]);
for (const [cx, cz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) inputs.push([`seams-world ${cx},${cz}`, (ap) => core.buildRegion((x, y, z) => world(x + cx * 32, y, z + cz * 32), ap)]);
let tris = 0, bad = 0, fitted = 0;
for (const [label, mk] of inputs) {
  const ma = mod.mesh(mk(A), null, core), mb = mod.mesh(mk(REF), null, core);
  if (ma.T !== mb.T) { console.log(label, 'triangle counts differ', ma.T, mb.T); bad++; continue; }
  let d = 0;
  for (let t = 0; t < ma.T; t++) {
    let same = true, any = false;
    for (let k = 0; k < 3; k++) {
      const va = ma.tri[t * 3 + k], vb = mb.tri[t * 3 + k];
      for (let j = 0; j < 3; j++) if (ma.slotBytes[va * 3 + j] !== mb.slotBytes[vb * 3 + j]) same = false;
      if (ma.slotBytes[va * 3] & 128) any = true;
    }
    tris++; if (any) fitted++;
    if (!same) d++;
  }
  if (d) console.log(`${label}: ${d} triangles differ`);
  bad += d;
}
console.log(`apron ${A} vs ${REF}: ${bad} of ${tris} triangles differ (${fitted} triangles carry fitted slots)`);
