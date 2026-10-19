// vgn: an unedited chunk must mesh to identical bytes at apron 3 (GEN_MESH)
// and apron 10 (REMESH always uses 10): check gn-best on the 45 survey chunks.
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion } from '../gn/mesher-gn.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { readFileSync } from 'node:fs';
const J = JSON.parse(readFileSync(new URL('./terrain-ao.json', import.meta.url)));
let bad = 0, n = 0;
for (const { seed, c } of J.chunks) {
  const a = meshRegion({ ...buildGenMeshInput(seed, ...c, new Map(), { forceApron: 3 }).input, params: PARAMS });
  const b = meshRegion({ ...buildGenMeshInput(seed, ...c, new Map(), { forceApron: 10 }).input, params: PARAMS });
  const ua = new Uint8Array(a.vertexData), ub = new Uint8Array(b.vertexData);
  const same = ua.length === ub.length && ua.every((x, i) => x === ub[i]) && a.indexData.length === b.indexData.length && a.indexData.every((x, i) => x === b.indexData[i]);
  n++; if (!same) { bad++; console.log('differs', seed, c); }
}
console.log(`${n} unedited chunks: apron 3 vs 10 bytes differ in ${bad}`);
