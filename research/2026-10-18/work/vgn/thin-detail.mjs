// vgn: shadow-side views of thin builds and where inverted shading normals sit.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { THIN, BASE } from './thin-scenes.mjs';
import { renderRow } from './world.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
const get = (n) => THIN.find((s) => s.name === n);
const SUN = [0.5, 0.8, 0.3].map((x) => x / Math.hypot(0.5, 0.8, 0.3));
for (const [n, eye, target] of [
  ['posts-gap2', [10, BASE + 3.5, 9], [16, BASE + 1.5, 16]],
  ['tree', [12, BASE + 4, 11], [16.5, BASE + 3, 16.5]],
  ['fence-1w-3h', [9, BASE + 3, 4], [16, BASE + 1.5, 14]],
]) {
  const s = get(n);
  const region = core.buildRegion(s.cell, 10);
  const P = core.decodeMesh(repoMesh({ ...region, params: {} }));
  const G = core.decodeMesh(gnMesh({ ...region, params: PARAMS }));
  renderRow(`${OUT}${n}-shadowside.png`, [P, G], { eye, target, fov: 55, width: 480, height: 340 });
  // inverted pairs: list positions + normals
  const fn = [0, 0, 0, 0];
  const seen = new Map();
  let litWrong = 0, faceN = 0;
  for (let t = 0; t < G.T; t++) {
    core.faceNormal(G, t, fn);
    if (!(fn[3] > 1e-9)) continue;
    for (let k = 0; k < 3; k++) {
      const v = G.tri[t * 3 + k];
      const d = G.nrm[v * 3] * fn[0] + G.nrm[v * 3 + 1] * fn[1] + G.nrm[v * 3 + 2] * fn[2];
      if (d < 0 && !seen.has(v)) seen.set(v, [[0, 1, 2].map((a) => +G.pos[v * 3 + a].toFixed(2)), [0, 1, 2].map((a) => +G.nrm[v * 3 + a].toFixed(2)), fn.slice(0, 3).map((x) => +x.toFixed(2)), +d.toFixed(2)]);
    }
    // faces turned away from the sun (geometric) that the shading lights by sun
    const sunGeom = fn[0] * SUN[0] + fn[1] * SUN[1] + fn[2] * SUN[2];
    if (Math.abs(fn[1]) < 0.3 && sunGeom < 0) {
      faceN++;
      let s2 = 0;
      for (let k = 0; k < 3; k++) { const v = G.tri[t * 3 + k]; s2 += Math.max(0, G.nrm[v * 3] * SUN[0] + G.nrm[v * 3 + 1] * SUN[1] + G.nrm[v * 3 + 2] * SUN[2]) / 3; }
      if (s2 > 0.4) litWrong++;
    }
  }
  console.log(`${n}: ${seen.size} vertices with an inverted pair; ${litWrong}/${faceN} shadow-side wall triangles get sun term > 0.4 under gn-best`);
  for (const [v, r] of [...seen].slice(0, 6)) console.log('   pos', r[0], 'n', r[1], 'face', r[2], 'dot', r[3]);
}
