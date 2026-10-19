// Apron sensitivity: per-vertex slot bytes of each bench chunk at apron A vs a
// large reference apron (same chunk, same base mesh). Any difference means the
// result depends on data beyond A.  node apron.mjs <module> A [ref=18] [k=v]
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
const A = Number(process.argv[3] ?? 10);
let REF = 18;
for (const a of process.argv.slice(4)) { const [k, v] = a.split('='); if (k === 'ref') REF = +v; else mod.OPT[k] = Number(v); }
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let tot = 0, bad = 0, withPieces = 0;
for (const c of CHUNKS) {
  const ma = mod.mesh(buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: A }).input, null, core);
  const mb = mod.mesh(buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: REF }).input, null, core);
  // vertex order may differ: key by corner + material + sharp
  const key = (m, v) => `${m.corner[v * 3]},${m.corner[v * 3 + 1]},${m.corner[v * 3 + 2]},${m.mat[v]},${m.flags[v] & 1}`;
  const mapB = new Map();
  for (let v = 0; v < mb.V; v++) mapB.set(key(mb, v), v);
  let d = 0, maxEdge = -1;
  for (let v = 0; v < ma.V; v++) {
    const w = mapB.get(key(ma, v));
    if (w === undefined) continue;
    tot++;
    if (ma.slotBytes[v * 3] & 128) withPieces++;
    if (ma.slotBytes[v * 3] !== mb.slotBytes[w * 3] || ma.slotBytes[v * 3 + 1] !== mb.slotBytes[w * 3 + 1] || ma.slotBytes[v * 3 + 2] !== mb.slotBytes[w * 3 + 2]) {
      d++;
      const cx = ma.corner[v * 3], cz = ma.corner[v * 3 + 2];
      const e = Math.min(cx, cz, 32 - cx, 32 - cz);
      if (e > maxEdge) maxEdge = e;
    }
  }
  if (d) console.log(`chunk ${c}: ${d} vertices differ (deepest ${maxEdge} blocks inside the chunk)`);
  bad += d;
}
console.log(`apron ${A} vs ${REF}: ${bad} of ${tot} vertices differ (${withPieces} carry fitted slots)`);
