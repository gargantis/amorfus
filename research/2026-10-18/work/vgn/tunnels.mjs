// vgn: player-dug tunnels through generated stone (edited air in hinted
// rock): 1×1, 1×2, 2×2, 3×3 cross-sections, 24 long along z. In a narrow
// tunnel the 3-ring spans the whole cross-section, so floor, wall and
// ceiling normals average together.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { STONE, AIR } from '../../harness/core.mjs';
import { renderRow } from './world.mjs';
import { normalStats } from './thin-lib.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
const TOP = 24; // generated rock surface far above
for (const [w, h] of [[1, 1], [1, 2], [2, 2], [3, 3]]) {
  const x0 = 16, y0 = 10;
  const cell = (x, y, z) => {
    const dug = x >= x0 && x < x0 + w && y >= y0 && y < y0 + h && z >= 4 && z < 28;
    const d = TOP - (y + 0.5);
    if (dug) return { v: AIR, edited: true };
    return d > 0 ? { v: STONE, rho: clampRho(d) } : { v: AIR, rho: clampRho(d) };
  };
  const region = core.buildRegion(cell, 10);
  const P = core.decodeMesh(repoMesh({ ...region, params: {} }));
  const G = core.decodeMesh(gnMesh({ ...region, params: PARAMS }));
  // floor vertices: normal y component (should be ~ +1)
  const floor = (m) => { let s = 0, n = 0, minY = 1; for (let v = 0; v < m.V; v++) { const p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]]; if (Math.abs(p[1] - y0) < 0.3 && p[0] > x0 + 0.2 && p[0] < x0 + w - 0.2 && p[2] > 8 && p[2] < 24) { s += m.nrm[v * 3 + 1]; n++; minY = Math.min(minY, m.nrm[v * 3 + 1]); } } return n ? `${(s / n).toFixed(2)} (min ${minY.toFixed(2)}, n ${n})` : '—'; };
  const wall = (m) => { let s = 0, n = 0; for (let v = 0; v < m.V; v++) { const p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]]; if (Math.abs(p[0] - x0) < 0.3 && p[1] > y0 + 0.2 && p[1] < y0 + h - 0.2 && p[2] > 8 && p[2] < 24) { s += m.nrm[v * 3]; n++; } } return n ? `${(s / n).toFixed(2)} (n ${n})` : 'no interior wall vertices'; };
  const a = normalStats(P), b = normalStats(G);
  console.log(`tunnel ${w}×${h}: floor normal.y prod ${floor(P)} gn ${floor(G)} | −x wall normal.x prod ${wall(P)} gn ${wall(G)} | inverted pairs ${a.inv}→${b.inv}`);
  renderRow(`${OUT}tunnel-${w}x${h}.png`, [P, G], { eye: [x0 + w / 2, y0 + h * 0.6, 27.5], target: [x0 + w / 2, y0 + h * 0.4, 10], fov: 70, width: 300, height: 300 });
}
