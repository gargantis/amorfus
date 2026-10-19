// vmf: the team's fast path (work/mf/fast.mjs, used by mf-iso) vs their
// prototype (work/mf/field.mjs) on the ADVERSARIAL scenes — attrs and index
// buffers must agree (their xcheck covered only the harness scenes + 4 chunks).
import * as core from '../../harness/core.mjs';
import { build } from '../mf/field.mjs';
import { makeFast } from '../mf/fast.mjs';
import { ADV_SCENES } from './adv-scenes.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const P = { sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 };
const slow = build({ name: 'x', kernel: { type: 'gauss', sigma: P.sigma, trunc: P.trunc }, guard: { type: 'support', tau: P.tau }, bits: P.bits, R: P.R, diag: 'auto', flipTwist: P.flipTwist });
const fast = makeFast(P);
let bad = 0;
const cmp = (label, region) => {
  const a = slow.mesh(region, null, core);
  const b = fast(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region);
  if (a.V !== b.V || a.T !== b.T) { bad++; console.log(label, 'SIZE differs', a.V, b.V, a.T, b.T); return; }
  let diff = 0, tdiff = 0, maxd = 0;
  for (let i = 0; i < a.attrs.length; i++) { const d = Math.abs(a.attrs[i] - b.attrs[i]); if (d > 1e-9) { diff++; maxd = Math.max(maxd, d); } }
  for (let i = 0; i < a.tri.length; i++) if (a.tri[i] !== b.tri[i]) tdiff++;
  if (diff || tdiff) bad++;
  console.log(`${label}: attr diffs ${diff} (max ${maxd.toFixed(4)}), tri diffs ${tdiff}`);
};
for (const s of ADV_SCENES) cmp(s.name, core.buildRegion(s.cell, 10));
for (const c of [[-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [0, 1, 2], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [-1, 0, -1]]) cmp(`terrain ${c}`, buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input);
console.log(bad ? `MISMATCH in ${bad} meshes` : 'fast ≡ prototype on all');
