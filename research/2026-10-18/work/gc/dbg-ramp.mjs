import * as core from '../../harness/core.mjs';
import { GEOMETRY_SCENES } from '../../harness/scenes.mjs';
const A = await import(process.argv[2]);
const s = GEOMETRY_SCENES.find((x) => x.name === (process.argv[3] ?? 'ramp-1:1'));
const region = core.buildRegion(s.cell, A.apron ?? 10);
const m = A.mesh(region, null, core);
const g = s.ideal;
const bins = new Map();
const fn = [0, 0, 0, 0];
let worst = [];
for (let t = 0; t < m.T; t++) {
  const a = m.tri[t * 3], b = m.tri[t * 3 + 1], c = m.tri[t * 3 + 2];
  const cx = (m.pos[a * 3] + m.pos[b * 3] + m.pos[c * 3]) / 3, cy = (m.pos[a * 3 + 1] + m.pos[b * 3 + 1] + m.pos[c * 3 + 1]) / 3, cz = (m.pos[a * 3 + 2] + m.pos[b * 3 + 2] + m.pos[c * 3 + 2]) / 3;
  if (!g.inWindow([cx, cy, cz])) continue;
  for (const v of [a, b, c]) {
    const n = [m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]];
    const p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
    const ni = g.normal(p);
    const ang = core.angleDeg(...n, ...ni);
    worst.push([ang, p.map((x) => x.toFixed(3)).join(','), n.map((x) => x.toFixed(3)).join(',')]);
  }
}
worst.sort((x, y) => y[0] - x[0]);
console.log(worst.slice(0, 12).map((w) => `${w[0].toFixed(2)}° at ${w[1]} n=${w[2]}`).join('\n'));
const hist = [0, 0, 0, 0, 0, 0];
for (const w of worst) hist[Math.min(5, Math.floor(w[0]))]++;
console.log('hist 0-1,1-2,..,5+ deg:', hist.join(' '));
