import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { meshRegion as gh } from './mesher-gh.mjs';
import { createHash } from 'node:crypto';
const h = (m) => createHash('sha256').update(Buffer.from(m.vertexData)).update(Buffer.from(m.indexData.buffer)).digest('hex').slice(0, 12);
let bad = 0;
for (const s of ALL_SCENES) {
  const r = core.buildRegion(s.cell, 10);
  for (const params of [{}, { rule: 'bevel' }, { k: 0 }]) {
    const a = h(core.meshRegion({ ...r, params })), b = h(gh({ ...r, params }));
    if (a !== b) { bad++; console.log('DIFF', s.name, JSON.stringify(params)); }
  }
}
console.log('scenes', ALL_SCENES.length, 'diffs', bad);
