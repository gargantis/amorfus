// Is work/gh/gnao.mjs byte-identical to gn-best's own AO? (hints geometry)
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import * as gnBest from '../../approaches/gn-best.mjs';
import { gnAo } from './gnao.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
let n = 0, bad = 0, meshes = 0;
const check = (region, label) => {
  const m = gnBest.mesh(region, null, core);
  if (!m.corner) throw new Error('no corners');
  const ao = gnAo(m, region);
  meshes++;
  for (let v = 0; v < m.V; v++) { n++; if (Math.round(ao[v] * 255) !== Math.round(m.ao[v] * 255)) { bad++; if (bad < 5) console.log(label, v, ao[v], m.ao[v]); } }
};
for (const s of ALL_SCENES) check(core.buildRegion(s.cell, 10), s.name);
for (const c of [[-1, 1, 1], [0, 0, -3], [0, 0, 0], [1, 1, 1]]) for (const A of [3, 10]) check(buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: A }).input, `terrain ${c} a${A}`);
console.log(`${meshes} meshes, ${n} vertices, ${bad} AO bytes differ from gn-best`);
