// vgn: where are gn-best's inverted shading normals (dot with own face < 0)
// in the house, beam, table and diagonal wall?
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { THIN } from './thin-scenes.mjs';
for (const n of ['house-door-window', 'beam-1x1-span', 'table', 'wall-diag-1w']) {
  const s = THIN.find((x) => x.name === n);
  const G = core.decodeMesh(gnMesh({ ...core.buildRegion(s.cell, 10), params: PARAMS }));
  const fn = [0, 0, 0, 0];
  const hits = new Map();
  for (let t = 0; t < G.T; t++) {
    core.faceNormal(G, t, fn);
    if (!(fn[3] > 1e-9)) continue;
    for (let k = 0; k < 3; k++) {
      const v = G.tri[t * 3 + k];
      const d = G.nrm[v * 3] * fn[0] + G.nrm[v * 3 + 1] * fn[1] + G.nrm[v * 3 + 2] * fn[2];
      if (d < 0) { const key = [0, 1, 2].map((a) => G.pos[v * 3 + a].toFixed(2)).join(','); const h = hits.get(key) ?? { n: [0, 1, 2].map((a) => +G.nrm[v * 3 + a].toFixed(2)), faces: [], worst: 1 }; h.faces.push(fn.slice(0, 3).map((x) => +x.toFixed(2)).join('/')); h.worst = Math.min(h.worst, d); hits.set(key, h); }
    }
  }
  console.log(`${n}: ${hits.size} vertices`);
  for (const [k, h] of [...hits].sort((a, b) => a[1].worst - b[1].worst).slice(0, 6)) console.log(`   at ${k} shading n ${h.n} vs faces ${[...new Set(h.faces)].join(' ')} (dot ${h.worst.toFixed(2)})`);
}
