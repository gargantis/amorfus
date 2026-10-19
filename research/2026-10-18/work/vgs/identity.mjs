// (1) unedited GEN_MESH chunks: gs-ctx / gs-mls byte-identical to hints (lib)?
// (2) gs mesher with default params byte-identical to lib on every harness scene?
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion as lib } from '../../lib/mesher.mjs';
import { meshRegion as gs } from '../gs/mesher-gs.mjs';
import { params as ctx } from '../../approaches/gs-ctx.mjs';
import { params as mls } from '../../approaches/gs-mls.mjs';
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
const same = (a, b) => a.vertexCount === b.vertexCount && Buffer.compare(Buffer.from(a.vertexData), Buffer.from(b.vertexData)) === 0 && Buffer.compare(Buffer.from(a.indexData.buffer, a.indexData.byteOffset, a.indexData.byteLength), Buffer.from(b.indexData.buffer, b.indexData.byteOffset, b.indexData.byteLength)) === 0;
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let okC = 0, okM = 0;
for (const c of CH) for (const A of [3, 10]) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: A }).input;
  const h = lib({ ...inp, params: {} });
  if (same(h, gs({ ...inp, params: ctx }))) okC++;
  if (same(h, gs({ ...inp, params: mls }))) okM++;
}
console.log(`unedited GEN_MESH chunks (16 × apron 3 and 10): gs-ctx identical ${okC}/32, gs-mls identical ${okM}/32`);
let okD = 0, n = 0;
for (const s of ALL_SCENES) {
  const r = core.buildRegion(s.cell, 10);
  n++;
  if (same(lib({ ...r, params: {} }), gs({ ...r, params: {} }))) okD++;
}
console.log(`gs mesher with default params identical to lib on ${okD}/${n} harness scenes`);
// (3) vertex and triangle counts unchanged on edited scenes
let cnt = 0, m = 0;
for (const s of ALL_SCENES) {
  const r = core.buildRegion(s.cell, 10);
  const a = lib({ ...r, params: {} }), b = gs({ ...r, params: mls });
  m++;
  if (a.vertexCount === b.vertexCount && a.quadCount === b.quadCount) cnt++;
}
console.log(`gs-mls vertex and quad counts equal to hints on ${cnt}/${m} harness scenes`);
