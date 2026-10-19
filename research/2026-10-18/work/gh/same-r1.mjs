// new mesher-gh bundle ≡ round-1 bundle (bytes) with gh-cc8b params, defaults, and k=6 narrow
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { WORLDS } from './worlds.mjs';
import { buildScenarios, scenarioInputs } from './editscenes.mjs';
import { meshRegion as a } from './mesher-gh-r1.mjs';
import { meshRegion as b } from './mesher-gh.mjs';
import { contourCross6 } from './syn2.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
import { createHash } from 'node:crypto';
const h = (m) => createHash('sha256').update(Buffer.from(m.vertexData)).update(Buffer.from(m.indexData.buffer, m.indexData.byteOffset, m.indexData.byteLength)).digest('hex');
let n = 0, bad = 0;
const regions = [...ALL_SCENES.map((s) => core.buildRegion(s.cell, 10)), ...Object.values(WORLDS).map((w) => core.buildRegion(w.cell, 10))];
const sc = buildScenarios();
for (const s of Object.values(sc)) regions.push(...scenarioInputs(s, 10));
for (const r of regions) {
  const c = contourCross6(r, cc8b.CFG);
  for (const params of [cc8b.PARAMS, {}, { clearance: 'narrow' }]) {
    n++;
    if (h(a({ ...r, crossT: c?.crossT, params })) !== h(b({ ...r, crossT: c?.crossT, params }))) bad++;
  }
}
console.log(`${n} meshes, ${bad} differ`);
