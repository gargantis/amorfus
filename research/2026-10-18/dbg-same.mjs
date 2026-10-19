// The study mesher must produce byte-identical meshes to the repo mesher.
import { meshRegion as a } from './lib/mesher.mjs';
import { meshRegion as b } from './lib/mesher-repo.mjs';
import { ALL_SCENES } from './harness/scenes.mjs';
import { buildRegion } from './harness/core.mjs';
let n = 0;
for (const s of ALL_SCENES) for (const params of [{}, { rule: 'bevel' }]) {
  const r = buildRegion(s.cell, 10);
  const x = a({ ...r, params }), y = b({ ...r, params });
  const same = Buffer.compare(Buffer.from(x.vertexData), Buffer.from(y.vertexData)) === 0 &&
    Buffer.compare(Buffer.from(x.indexData.buffer), Buffer.from(y.indexData.buffer)) === 0;
  if (!same) { console.log('DIFF', s.name, JSON.stringify(params)); process.exitCode = 1; }
  if (!x.corners || x.corners.length !== x.vertexCount * 3) { console.log('no corners', s.name); process.exitCode = 1; }
  n++;
}
console.log(`${n} meshes compared`);
