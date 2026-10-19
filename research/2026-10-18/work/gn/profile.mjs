// Per-pass profile (the mesher's __MESH_PROF marks), edited chunk with one block.
import { meshRegion as gn } from './mesher-gn.mjs';
import { meshRegion as repo } from '../../lib/mesher-repo.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
const CX_MIN = -(2 ** 18), CX_SPAN = 2 ** 19, CY_MIN = -8, CY_SPAN = 24;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
const C = [-1, 1, 1];
const edits = new Map([[key(...C), new Map([[((31) * 32 + 16) * 32 + 16, 3]])]]);
const inputs = { edited: buildGenMeshInput([1, 1], ...C, edits, {}).input, 'apron 3': buildGenMeshInput([1, 1], ...C, new Map(), { forceApron: 3 }).input };
for (const [label, inp] of Object.entries(inputs)) {
  console.log(label, 'apron', inp.apron);
  for (const [nm, f, prm] of [['repo', repo, {}], ['gn-best', gn, PARAMS]]) {
    const acc = {};
    for (let r = 0; r < 20; r++) {
      globalThis.__MESH_PROF = {};
      f({ ...inp, params: prm });
      if (r >= 5) for (const [k, v] of Object.entries(globalThis.__MESH_PROF)) acc[k] = Math.min(acc[k] ?? Infinity, v);
    }
    console.log(label, nm, Object.entries(acc).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', '));
  }
}
