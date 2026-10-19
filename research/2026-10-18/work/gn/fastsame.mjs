// The fast (production-shaped) path must emit the same bytes as the generic
// gn-best path: scenes (apron 10), bench chunks (apron 3 and 10), edited chunks.
import { meshRegion } from './mesher-gn.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { buildRegion } from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
// positions, AO, flags, material and indices must be identical; the octahedral
// normal may differ by the last quantisation step (separable float order)
let maxNormalStep = 0, normalDiffs = 0, verts = 0;
const same = (a, b) => {
  if (Buffer.compare(Buffer.from(a.indexData.buffer), Buffer.from(b.indexData.buffer)) !== 0) return false;
  if (a.vertexCount !== b.vertexCount) return false;
  const ua = new Uint8Array(a.vertexData), ub = new Uint8Array(b.vertexData);
  const ia = new Int16Array(a.vertexData), ib = new Int16Array(b.vertexData);
  for (let v = 0; v < a.vertexCount; v++) {
    verts++;
    for (const o of [0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15]) if (ua[v * 16 + o] !== ub[v * 16 + o]) return false;
    const d = Math.max(Math.abs(ia[v * 8 + 4] - ib[v * 8 + 4]), Math.abs(ia[v * 8 + 5] - ib[v * 8 + 5]));
    if (d > 0) normalDiffs++;
    if (d > maxNormalStep) maxNormalStep = d;
  }
  return true;
};
let n = 0, bad = 0;
const check = (label, input) => {
  const a = meshRegion({ ...input, params: PARAMS });
  const b = meshRegion({ ...input, params: { ...PARAMS, fastShade: true } });
  n++;
  if (!same(a, b)) { bad++; console.log('DIFF', label); }
};
for (const s of ALL_SCENES) check(s.name, buildRegion(s.cell, 10));
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
for (const c of CHUNKS) for (const ap of [3, 10]) check(`chunk ${c} apron ${ap}`, buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: ap }).input);
// edited: random-ish builds and digs around the surface of two chunks
const CX_MIN = -(2 ** 18), CX_SPAN = 2 ** 19, CY_MIN = -8, CY_SPAN = 24;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
for (const c of [[-1, 1, 1], [0, 0, -3]]) {
  const edits = new Map();
  let h = 12345;
  const rnd = () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 1500; i++) {
    const wx = c[0] * 32 - 6 + Math.floor(rnd() * 44), wy = c[1] * 32 + Math.floor(rnd() * 32), wz = c[2] * 32 - 6 + Math.floor(rnd() * 44);
    const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32), cz = Math.floor(wz / 32);
    const k = key(cx, cy, cz);
    if (!edits.has(k)) edits.set(k, new Map());
    const r = rnd();
    const v = r < 0.4 ? 0 : r < 0.5 ? (6 | 256) : r < 0.7 ? 5 : 3; // air, sharp brick, planks, stone
    edits.get(k).set(((wy - cy * 32) * 32 + (wz - cz * 32)) * 32 + (wx - cx * 32), v);
  }
  check(`edited chunk ${c}`, buildGenMeshInput([1, 1], ...c, edits, {}).input);
}
console.log(`${n} meshes: ${bad} differences in positions/AO/flags/material/indices between the generic and fast paths; normals: ${normalDiffs} of ${verts} vertices differ, by at most ${maxNormalStep} step(s) of 1/32767`);
