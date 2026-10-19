// Default params of the GS mesher must reproduce lib/mesher.mjs byte for byte.
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { meshRegion as gsMesh } from '../mesher-gs.mjs';
let bad = 0;
for (const s of ALL_SCENES) {
  const region = core.buildRegion(s.cell, 10);
  for (const params of [{}, { rule: 'bevel' }, { k: 0, forceZeroOffsets: true }]) {
    const a = core.meshRegion({ ...region, params });
    const b = gsMesh({ ...region, params });
    const va = new Uint8Array(a.vertexData), vb = new Uint8Array(b.vertexData);
    let same = va.length === vb.length && a.indexData.length === b.indexData.length;
    if (same) for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) { same = false; break; }
    if (same) for (let i = 0; i < a.indexData.length; i++) if (a.indexData[i] !== b.indexData[i]) { same = false; break; }
    if (!same) { bad++; console.log('MISMATCH', s.name, JSON.stringify(params)); }
  }
}
console.log(bad === 0 ? 'identical on all scenes x 3 param sets' : `${bad} mismatches`);
