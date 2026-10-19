// Triangle overhead and CPU time of the edited-only refinement on built
// scenes, and of full refinement on real terrain; interleaved repeats.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { meshRegion } from '../../lib/mesher.mjs';
import { buildCCAdaptive, buildCC } from './lib-gc.mjs';
const now = () => performance.now();
const scenes = ALL_SCENES.filter((s) => s.kind !== 'material' && s.name !== 'hinted-slope-1:4' && s.name !== 'hinted-hill');
let rows = [];
let totH = 0, totE = 0, tH = 0, tE = 0, tE11 = 0;
for (const s of scenes) {
  const r10 = core.buildRegion(s.cell, 10), r11 = core.buildRegion(s.cell, 11);
  // warm
  meshRegion({ ...r10, params: {} }); buildCCAdaptive(r11, { guard: "box", capEdges: true });
  let a = 0, b = 0, c = 0; let mh, me;
  for (let k = 0; k < 5; k++) {
    let t0 = now(); mh = core.decodeMesh(meshRegion({ ...r10, params: {} })); a += now() - t0;
    t0 = now(); meshRegion({ ...r11, params: {} }); c += now() - t0;
    t0 = now(); me = buildCCAdaptive(r11, { guard: "box", capEdges: true }); b += now() - t0;
  }
  totH += mh.T; totE += me.T; tH += a / 5; tE += b / 5; tE11 += c / 5;
  rows.push(`${s.name.padEnd(16)} tris ${String(mh.T).padStart(5)} -> ${String(me.T).padStart(5)} (x${(me.T / mh.T).toFixed(2)})  ms ${(a / 5).toFixed(1)} -> ${(b / 5).toFixed(1)}`);
}
console.log(rows.join('\n'));
console.log(`built scenes total: tris ${totH} -> ${totE} (x${(totE / totH).toFixed(2)}); mesher@52^3 ${tH.toFixed(1)} ms, mesher@54^3 ${tE11.toFixed(1)} ms, mesher+control+CC ${tE.toFixed(1)} ms (sum over scenes, mean of 5)`);
