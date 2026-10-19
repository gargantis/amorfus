// vmf: where the fast path and the prototype disagree on the 4-material corner.
import * as core from '../../harness/core.mjs';
import { build } from '../mf/field.mjs';
import { makeFast } from '../mf/fast.mjs';
import { sceneByName } from './adv-scenes.mjs';
const P = { sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 };
const slow = build({ name: 'x', kernel: { type: 'gauss', sigma: P.sigma, trunc: P.trunc }, guard: { type: 'support', tau: P.tau }, bits: P.bits, R: P.R, diag: 'auto', flipTwist: P.flipTwist });
const fastU = makeFast({ ...P, bits: 0, R: 99 }); // unquantised, unclamped fields
const fast = makeFast(P);
for (const ap of [10, 6]) {
  const region = core.buildRegion(sceneByName('corner4').cell, ap);
  const a = slow.mesh(region, null, core);
  const b = fast(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region);
  const u = fastU(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region);
  for (let v = 0; v < a.V; v++) for (let k = 0; k < 8; k++) {
    const i = v * 8 + k;
    if (Math.abs(a.attrs[i] - b.attrs[i]) > 1e-9) console.log(`apron ${ap} vertex ${v} corner ${a.corner[v * 3]},${a.corner[v * 3 + 1]},${a.corner[v * 3 + 2]} own ${a.mat[v]} slot ${k}: prototype ${a.attrs[i].toFixed(5)} fast ${b.attrs[i].toFixed(5)} raw r = ${u.attrs[i].toPrecision(17)} (r·30 = ${(u.attrs[i] * 30).toPrecision(17)})`);
  }
}
