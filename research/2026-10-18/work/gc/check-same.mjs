import { meshRegion as a } from '../../lib/mesher.mjs';
import { meshRegion as b } from './mesher-gc.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { buildRegion } from '../../harness/core.mjs';
let n = 0, bad = 0;
for (const s of ALL_SCENES) {
  const r = buildRegion(s.cell, 12);
  const m1 = a({ ...r, params: {} });
  const m2 = b({ ...r, params: { margin: 3 } });
  const x = new Uint8Array(m1.vertexData), y = new Uint8Array(m2.vertexData);
  let same = x.length === y.length && m1.indexData.length === m2.indexData.length;
  if (same) for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { same = false; break; }
  if (same) for (let i = 0; i < m1.indexData.length; i++) if (m1.indexData[i] !== m2.indexData[i]) { same = false; break; }
  n++; if (!same) { bad++; console.log('DIFF', s.name); }
  if (s.name === 'mound-r6.4') console.log('control quads', m2.control.quadCount, 'owned', m2.control.owned.reduce((p, c) => p + c, 0), 'emitted', m1.quadCount);
}
console.log(`${n} scenes, ${bad} differ`);
