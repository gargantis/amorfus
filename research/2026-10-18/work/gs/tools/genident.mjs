// On generated terrain (no edits) gs-mls must be byte-identical to hints.
import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { meshRegion as lib } from '../../../lib/mesher.mjs';
import { meshRegion as gs } from '../mesher-gs.mjs';
import { params } from '../../../approaches/gs-mls.mjs';
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let same = 0;
for (const c of CHUNKS) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const a = lib({ ...inp, params: {} }), b = gs({ ...inp, params });
  const va = new Uint8Array(a.vertexData), vb = new Uint8Array(b.vertexData);
  let ok = va.length === vb.length && a.indexData.length === b.indexData.length;
  if (ok) for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) { ok = false; break; }
  if (ok) for (let i = 0; i < a.indexData.length; i++) if (a.indexData[i] !== b.indexData[i]) { ok = false; break; }
  if (ok) same++;
}
console.log(`generated terrain: ${same}/${CHUNKS.length} bench chunks byte-identical to hints`);
