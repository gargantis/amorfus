// emitControl must reproduce the production plain mesh exactly.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { controlMesh, topology, emitControl } from './lib-gc.mjs';
let bad = 0;
for (const s of ALL_SCENES) {
  const region = core.buildRegion(s.cell, 13);
  const prod = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  const { c } = controlMesh(region);
  const t = topology(c);
  const m = emitControl(c, t);
  let ok = prod.V === m.V && prod.T === m.T;
  let maxP = 0, maxN = 0, triBad = 0;
  if (ok) {
    for (let i = 0; i < prod.V * 3; i++) { maxP = Math.max(maxP, Math.abs(prod.pos[i] - m.pos[i])); maxN = Math.max(maxN, Math.abs(prod.nrm[i] - m.nrm[i])); }
    for (let i = 0; i < prod.T * 3; i++) if (prod.tri[i] !== m.tri[i]) triBad++;
  }
  if (!ok || maxP > 0 || maxN > 1e-12 || triBad) { bad++; console.log(s.name, prod.V, m.V, prod.T, m.T, maxP, maxN, triBad); }
}
console.log('scenes differing:', bad);
