// Restricting the pre-relaxation normal pass to the edit box must not change bytes.
import { meshRegion } from './mesher-gn.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { buildRegion } from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
const CX_MIN = -(2 ** 18), CX_SPAN = 2 ** 19, CY_MIN = -8, CY_SPAN = 24;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
let n = 0, bad = 0;
const chk = (label, inp) => {
  const a = meshRegion({ ...inp, params: PARAMS }), b = meshRegion({ ...inp, params: { ...PARAMS, naccBoxAll: true } });
  n++;
  if (Buffer.compare(Buffer.from(a.vertexData), Buffer.from(b.vertexData)) !== 0) { bad++; console.log('DIFF', label); }
};
for (const s of ALL_SCENES) chk(s.name, buildRegion(s.cell, 10));
for (const c of [[-1, 1, 1], [0, 0, -3]]) {
  for (const seed of [1, 2, 3]) {
    const edits = new Map();
    let h = 1000 + seed;
    const rnd = () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 400 * seed; i++) {
      const wx = c[0] * 32 - 8 + Math.floor(rnd() * 48), wy = c[1] * 32 - 4 + Math.floor(rnd() * 40), wz = c[2] * 32 - 8 + Math.floor(rnd() * 48);
      const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32), cz = Math.floor(wz / 32);
      const k = key(cx, cy, cz);
      if (!edits.has(k)) edits.set(k, new Map());
      const r = rnd();
      edits.get(k).set(((wy - cy * 32) * 32 + (wz - cz * 32)) * 32 + (wx - cx * 32), r < 0.4 ? 0 : r < 0.5 ? (6 | 256) : r < 0.7 ? 5 : 3);
    }
    chk(`edited ${c} x${seed}`, buildGenMeshInput([1, 1], ...c, edits, {}).input);
  }
}
console.log(`${n} meshes, ${bad} differences (edit-box restriction vs every quad)`);
