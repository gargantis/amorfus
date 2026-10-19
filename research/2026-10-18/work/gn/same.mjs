// Default params of the gn mesher must equal the repo mesher byte for byte;
// any shading params must leave positions and indices byte-identical.
import { meshRegion as gn } from './mesher-gn.mjs';
import { meshRegion as repo } from '../../lib/mesher-repo.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { buildRegion } from '../../harness/core.mjs';
const shade = { aoRule: 'smooth', aoKernel: 'box', pvRule: 'hybrid', normalRule: 'ring', normalRings: 2 };
let n = 0, bad = 0;
for (const s of ALL_SCENES) for (const params of [{}, { rule: 'bevel' }]) {
  const r = buildRegion(s.cell, 10);
  const x = gn({ ...r, params }), y = repo({ ...r, params });
  const same = Buffer.compare(Buffer.from(x.vertexData), Buffer.from(y.vertexData)) === 0 &&
    Buffer.compare(Buffer.from(x.indexData.buffer), Buffer.from(y.indexData.buffer)) === 0;
  if (!same) { console.log('DIFF default', s.name, JSON.stringify(params)); bad++; }
  const z = gn({ ...r, params: { ...params, ...shade } });
  const samePos = Buffer.compare(Buffer.from(z.positions.buffer), Buffer.from(y.positions.buffer)) === 0 &&
    Buffer.compare(Buffer.from(z.indexData.buffer), Buffer.from(y.indexData.buffer)) === 0;
  if (!samePos) { console.log('POSITIONS CHANGED', s.name, JSON.stringify(params)); bad++; }
  n++;
}
console.log(`${n} scene meshes compared, ${bad} differences`);
