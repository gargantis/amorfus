import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { build } from './field.mjs';
import { makeFast } from './fast.mjs';
import { regionFor } from './sweep.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const P = { sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 };
const slow = build({ name: 'x', kernel: { type: 'gauss', sigma: P.sigma, trunc: P.trunc }, guard: { type: 'support', tau: P.tau }, bits: P.bits, R: P.R, diag: 'auto', flipTwist: P.flipTwist });
const fast = makeFast(P);
const cmp = (label, region) => {
  const a = slow.mesh(region, null, core);
  const t0 = performance.now();
  const b = fast(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region);
  const ms = performance.now() - t0;
  let diff = 0, tdiff = 0;
  if (a.V !== b.V || a.T !== b.T) { console.log(label, 'SIZE', a.V, b.V, a.T, b.T, JSON.stringify(a.mfStats), JSON.stringify(b.mfStats)); return; }
  for (let i = 0; i < a.attrs.length; i++) if (Math.abs(a.attrs[i] - b.attrs[i]) > 1e-9) diff++;
  for (let i = 0; i < a.tri.length; i++) if (a.tri[i] !== b.tri[i]) tdiff++;
  console.log(label, 'attr diffs', diff, 'tri diffs', tdiff, 'fans', b.mfStats.fans, 'flips', b.mfStats.flipped, `${ms.toFixed(1)} ms (incl. base mesh)`);
};
for (const s of MATERIAL_SCENES) cmp(s.name, regionFor(s, 10));
for (const c of [[-1, 1, 1], [0, 0, -3], [0, 0, 0], [1, 1, 1]]) cmp(`terrain ${c}`, buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input);
