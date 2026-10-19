// The cone restriction must not change the chunk's output (bytes).
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { meshRegion } from '../mesher-gs.mjs';
const base = JSON.parse(process.argv[2]);
let bad = 0;
for (const s of ALL_SCENES) {
  const region = core.buildRegion(s.cell, 10);
  const a = meshRegion({ ...region, params: { ...base, mlsCone: false } });
  const b = meshRegion({ ...region, params: { ...base, mlsCone: true } });
  const va = new Uint8Array(a.vertexData), vb = new Uint8Array(b.vertexData);
  let same = va.length === vb.length && a.indexData.length === b.indexData.length;
  if (same) for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) { same = false; break; }
  if (same) for (let i = 0; i < a.indexData.length; i++) if (a.indexData[i] !== b.indexData[i]) { same = false; break; }
  if (!same) { bad++; console.log('DIFF', s.name); }
}
console.log(bad ? `${bad} scenes differ` : 'cone restriction: byte-identical on all scenes');
