// The patched gs copy must equal (a) the gs mesher when crossT is absent and
// capMode ≠ 'narrow', and (b) the gh mesher when given the same crossT with
// capMode 'narrow' and k = 0 (jacobi, no gs extras).
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { meshRegion as gs } from '../gs/mesher-gs.mjs';
import { meshRegion as ghgs } from './mesher-ghgs.mjs';
import { meshRegion as gh } from './mesher-gh.mjs';
import { contourCross5 } from './syn2.mjs';
import * as gsMls from '../../approaches/gs-mls.mjs';
import { createHash } from 'node:crypto';
const h = (m) => createHash('sha256').update(Buffer.from(m.vertexData)).update(Buffer.from(m.indexData.buffer, m.indexData.byteOffset, m.indexData.byteLength)).digest('hex').slice(0, 12);
let bad = 0, n = 0;
for (const s of ALL_SCENES) {
  const r = core.buildRegion(s.cell, 10);
  for (const params of [{}, gsMls.params, { capMode: 'context', editMid: true, rDilate: 1 }]) {
    n++;
    if (h(gs({ ...r, params })) !== h(ghgs({ ...r, params }))) { bad++; console.log('DIFF gs', s.name, JSON.stringify(params)); }
  }
  const c = contourCross5(r, { cliffH: true, mirror: true });
  n++;
  const a = gh({ ...r, crossT: c?.crossT, params: { k: 0, clearance: 'narrow' } });
  const b = ghgs({ ...r, crossT: c?.crossT, params: { k: 0, capMode: 'narrow' } });
  if (h(a) !== h(b)) { bad++; console.log('DIFF gh', s.name); }
}
console.log(`${n} meshes compared, ${bad} differ`);
