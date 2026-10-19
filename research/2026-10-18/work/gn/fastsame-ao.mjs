// gn-ao via the fast path must equal the generic AO-only path byte for byte.
import { meshRegion } from './mesher-gn.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { buildRegion } from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS } from '../../approaches/gn-ao.mjs';
let n = 0, bad = 0;
const chk = (label, inp) => {
  const a = meshRegion({ ...inp, params: PARAMS }), b = meshRegion({ ...inp, params: { ...PARAMS, fastShade: false } });
  n++;
  if (Buffer.compare(Buffer.from(a.vertexData), Buffer.from(b.vertexData)) !== 0) { bad++; console.log('DIFF', label); }
};
for (const s of ALL_SCENES) chk(s.name, buildRegion(s.cell, 10));
for (const c of [[-1, 1, 1], [0, 0, -3], [0, 0, 0]]) chk(`chunk ${c}`, buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 3 }).input);
console.log(`${n} meshes, ${bad} differences (gn-ao fast vs generic)`);
