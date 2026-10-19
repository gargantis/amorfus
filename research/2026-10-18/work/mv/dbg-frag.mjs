import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import * as ap from '../../approaches/mv-fit.mjs';
import { decodeSlots } from './pipeline.mjs';
const [name, qx, qz] = process.argv.slice(2);
const scene = ALL_SCENES.find((s) => s.name === name);
const region = core.buildRegion(scene.cell, ap.apron);
const m = ap.mesh(region, scene, core);
const X = +qx, Z = +qz;
for (let t = 0; t < m.T; t++) {
  const a = m.tri[t * 3], b = m.tri[t * 3 + 1], c = m.tri[t * 3 + 2];
  const P = (v) => [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
  const [pa, pb, pc] = [P(a), P(b), P(c)];
  const area = (pb[0] - pa[0]) * (pc[2] - pa[2]) - (pb[2] - pa[2]) * (pc[0] - pa[0]);
  if (area >= -1e-12) continue;
  const w0 = ((pb[0] - X) * (pc[2] - Z) - (pb[2] - Z) * (pc[0] - X)) / area;
  const w1 = ((pc[0] - X) * (pa[2] - Z) - (pc[2] - Z) * (pa[0] - X)) / area;
  const w2 = 1 - w0 - w1;
  if (w0 < 0 || w1 < 0 || w2 < 0) continue;
  const att = [0, 1].map((d) => w0 * m.attrs[a * 2 + d] + w1 * m.attrs[b * 2 + d] + w2 * m.attrs[c * 2 + d]);
  const info = { a, b, c, ownMat: m.mat[a] };
  const out = ap.fragment(att, info);
  const dv = (v) => { const d = decodeSlots(m.slotBytes[v * 3], m.slotBytes[v * 3 + 1], m.slotBytes[v * 3 + 2], 64); return `v${v}@(${m.corner[v * 3]},${m.corner[v * 3 + 2]}) mat${m.mat[v]} s=(${d.s1},${d.s2}) o=(${d.o1},${d.o2}) op=${d.op}`; };
  console.log(`tri ${t} y=${(w0 * pa[1] + w1 * pb[1] + w2 * pc[1]).toFixed(3)} att=(${att[0].toFixed(3)},${att[1].toFixed(3)}) -> ${out}\n  ${dv(a)}\n  ${dv(b)}\n  ${dv(c)}`);
}
