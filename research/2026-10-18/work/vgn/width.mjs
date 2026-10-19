// vgn: how wide must a built feature be before its shadow-side walls stop
// being sun-lit under gn-best? Columns w×w and walls w-thick, height 3 and 6.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { ground, BASE } from './thin-scenes.mjs';
import { STONE } from '../../harness/core.mjs';
const SUN = [0.5, 0.8, 0.3].map((x) => x / Math.hypot(0.5, 0.8, 0.3));
const light = (n) => 0.9 * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) + 0.35 + 0.25 * (n[1] * 0.5 + 0.5);
function stats(m) {
  // shadow-side vertical faces: mean |light(shading) − light(face)| and fraction lit > face light + 0.25
  const fn = [0, 0, 0, 0];
  let n = 0, dsum = 0, bright = 0;
  for (let t = 0; t < m.T; t++) {
    core.faceNormal(m, t, fn);
    if (!(fn[3] > 1e-9) || Math.abs(fn[1]) > 0.3) continue;
    if (fn[0] * SUN[0] + fn[1] * SUN[1] + fn[2] * SUN[2] >= 0) continue;
    // centroid y above BASE + 0.3 (exclude the ground fillet)
    const yc = (m.pos[m.tri[t * 3] * 3 + 1] + m.pos[m.tri[t * 3 + 1] * 3 + 1] + m.pos[m.tri[t * 3 + 2] * 3 + 1]) / 3;
    if (yc < BASE + 0.3) continue;
    const lf = light(fn);
    let ls = 0;
    for (let k = 0; k < 3; k++) { const v = m.tri[t * 3 + k]; ls += light([m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]]) / 3; }
    n++; dsum += ls - lf; if (ls > lf + 0.25) bright++;
  }
  return { n, mean: dsum / n, bright: bright / n };
}
console.log('shadow-side wall triangles: mean (shading light − face light), share brighter by > 0.25 (face light ≈ 0.4–0.48; sunlit wall ≈ 0.9–1.2)');
for (const kind of ['column', 'wall']) for (const H of [3, 6]) for (const w of [1, 2, 3, 4]) {
  const inside = kind === 'column' ? (x, z) => x >= 16 && x < 16 + w && z >= 16 && z < 16 + w : (x, z) => x >= 16 && x < 16 + w && z >= 6 && z < 26;
  const cell = (x, y, z) => (y >= BASE && y < BASE + H && inside(x, z) ? { v: STONE, edited: true } : ground(x, y, z));
  const region = core.buildRegion(cell, 10);
  const P = core.decodeMesh(repoMesh({ ...region, params: {} }));
  const G = core.decodeMesh(gnMesh({ ...region, params: PARAMS }));
  const a = stats(P), b = stats(G);
  console.log(`${kind} ${w}-wide, ${H} high: prod ${a.mean.toFixed(2)} / ${(100 * a.bright).toFixed(0)}%  →  gn ${b.mean.toFixed(2)} / ${(100 * b.bright).toFixed(0)}%   (${b.n} tris)`);
}
