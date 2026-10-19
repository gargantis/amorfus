// vgn: gn-best fast path (fastShade) vs its reference path on the vgn
// adversarial scenes + edited real terrain: bytes must be identical.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { THIN } from './thin-scenes.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { setBlock } from './util.mjs';
const REF = { ...PARAMS, fastShade: false };
const inputs = THIN.map((s) => [s.name, core.buildRegion(s.cell, 10)]);
let rs = 7;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
for (const seed of [[1, 1], [7, 7]]) for (const c of [[-1, 1, 1], [0, 0, -3], [3, 1, 1], [2, 0, -1]]) {
  const e = new Map();
  for (let i = 0; i < 400; i++) setBlock(e, c[0] * 32 + Math.floor(rnd() * 32), c[1] * 32 + Math.floor(rnd() * 32), c[2] * 32 + Math.floor(rnd() * 32), rnd() < 0.4 ? 0 : rnd() < 0.8 ? 5 : 6 | 256);
  inputs.push([`${seed}@${c}+400 random`, buildGenMeshInput(seed, ...c, e, {}).input]);
}
let bad = 0;
for (const [label, inp] of inputs) {
  const a = gnMesh({ ...inp, params: PARAMS }), b = gnMesh({ ...inp, params: REF });
  const ua = new Uint8Array(a.vertexData), ub = new Uint8Array(b.vertexData);
  let d = ua.length !== ub.length ? -1 : 0;
  if (!d) for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) d++;
  if (d) { bad++; console.log('DIFF', label, d); }
}
console.log(`${inputs.length} meshes: fast vs reference path differ in ${bad}`);
