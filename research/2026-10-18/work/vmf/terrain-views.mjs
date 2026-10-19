// vmf: real generated terrain (seed 1,1), hints vs mf-iso side by side, at
// production aprons (hints 3 → use 10 for geometry parity; mf-iso 6).
//   node work/vmf/terrain-views.mjs cx,cy,cz eyeX,eyeY,eyeZ tgtX,tgtY,tgtZ name [w h]
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { loadApproach, renderShaded, hcat, save, ROOT } from './lib.mjs';
const [c, e, t, name, w = '480', h = '320'] = process.argv.slice(2);
const C = c.split(',').map(Number), E = e.split(',').map(Number), T = t.split(',').map(Number);
const imgs = [];
for (const p of ['approaches/hints.mjs', 'approaches/mf-iso.mjs']) {
  const A = await loadApproach(p);
  const input = buildGenMeshInput([1, 1], C[0], C[1], C[2], new Map(), { forceApron: A.apron ?? 10 }).input;
  const m = A.mesh(input, null, core);
  imgs.push(renderShaded(m, { width: Number(w), height: Number(h), eye: E, target: T, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null }));
}
save(join(ROOT, 'out', 'vmf-adv', `terrain-${name}.png`), hcat(imgs));
console.log(join(ROOT, 'out', 'vmf-adv', `terrain-${name}.png`));
