// Is work/stack/ao.mjs byte-identical to gn's own AO bytes, for both curves?
//   quad   vs approaches/vgn-aoq.mjs params (gn-best AO, production normals)
//   linear vs approaches/gn-ao.mjs params
// on hints geometry: every harness scene (apron 10) + 6 real chunks at aprons 3 and 10.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { PARAMS as AOQ } from '../../approaches/vgn-aoq.mjs';
import { PARAMS as AOL } from '../../approaches/gn-ao.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { boxAo } from './ao.mjs';
let meshes = 0, n = 0;
const bad = { quad: 0, linear: 0 };
const check = (region) => {
  for (const [curve, P] of [['quad', AOQ], ['linear', AOL]]) {
    const ref = core.decodeMesh(gnMesh({ ...region, params: P }));
    const base = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
    if (ref.V !== base.V) throw new Error('vertex count differs');
    const ao = boxAo(base, region, curve);
    for (let v = 0; v < base.V; v++) { if (Math.round(ao[v] * 255) !== Math.round(ref.ao[v] * 255)) bad[curve]++; }
    if (curve === 'quad') { meshes++; n += base.V; }
  }
};
for (const s of ALL_SCENES) check(core.buildRegion(s.cell, 10));
for (const c of [[-1, 1, 1], [0, 0, -3], [0, 0, 0], [1, 1, 1], [-2, 1, 1], [0, 1, 2]]) for (const A of [3, 10]) check(buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: A }).input);
console.log(`${meshes} meshes, ${n} vertices: AO bytes differing from gn — quad ${bad.quad}, linear ${bad.linear}`);
process.exitCode = bad.quad + bad.linear ? 1 : 0;
