// vmf: mf-iso fields and index buffers at apron 6 vs 10 on every adversarial scene.
import * as core from '../../harness/core.mjs';
import { ADV_SCENES } from './adv-scenes.mjs';
import { loadApproach } from './lib.mjs';
const A = await loadApproach('approaches/mf-iso.mjs');
let bad = 0;
for (const s of ADV_SCENES) {
  const a = A.mesh(core.buildRegion(s.cell, 6), null, core), b = A.mesh(core.buildRegion(s.cell, 10), null, core);
  const same = a.V === b.V && a.T === b.T && a.attrs.every((v, i) => v === b.attrs[i]) && a.tri.every((v, i) => v === b.tri[i]) && a.pos.every((v, i) => v === b.pos[i]);
  if (!same) { bad++; console.log(`${s.name}: apron 6 ≠ apron 10 (V ${a.V}/${b.V}, T ${a.T}/${b.T})`); }
}
console.log(`${ADV_SCENES.length - bad} of ${ADV_SCENES.length} adversarial scenes identical at apron 6 and 10`);
