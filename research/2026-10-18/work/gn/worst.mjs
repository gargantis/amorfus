// Where are the worst shading-normal errors? (geometry scene, variant list)
import * as core from '../../harness/core.mjs';
import { GEOMETRY_SCENES } from '../../harness/scenes.mjs';
import { meshRegion } from './mesher-gn.mjs';
import { SETS } from './variants.mjs';
const [set, vlist, sn] = process.argv.slice(2);
const s = GEOMETRY_SCENES.find((x) => x.name === sn);
const region = core.buildRegion(s.cell, 12);
for (const vn of vlist.split(',')) {
  const m = core.decodeMesh(meshRegion({ ...region, params: SETS[set][vn] }));
  const rows = [];
  const seen = new Set();
  for (let t = 0; t < m.T; t++) {
    const vs = [m.tri[t * 3], m.tri[t * 3 + 1], m.tri[t * 3 + 2]];
    const c = [0, 1, 2].map((a) => vs.reduce((acc, v) => acc + m.pos[v * 3 + a], 0) / 3);
    if (!s.ideal.inWindow(c)) continue;
    for (const v of vs) {
      if (seen.has(v)) continue; seen.add(v);
      const p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
      const ni = s.ideal.normal(p);
      const e = core.angleDeg(m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2], ...ni);
      rows.push({ e, p: p.map((x) => x.toFixed(2)).join(','), n: [0, 1, 2].map((a) => m.nrm[v * 3 + a].toFixed(2)).join(','), ni: ni.map((x) => x.toFixed(2)).join(',') });
    }
  }
  rows.sort((a, b) => b.e - a.e);
  console.log(vn, rows.slice(0, 6).map((r) => `${r.e.toFixed(1)}° @${r.p} n=${r.n} ideal=${r.ni}`).join('\n   '));
}
