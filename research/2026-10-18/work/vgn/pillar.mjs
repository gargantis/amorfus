// vgn: 1×1 columns of height 3, 6, 12 (and the harness 'pillar'): side-vertex
// shading normals under gn-best vs production, by height above the ground.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { ground, BASE } from './thin-scenes.mjs';
import { STONE } from '../../harness/core.mjs';
import { renderRow } from './world.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
for (const H of [3, 6, 12]) {
  const cell = (x, y, z) => (y >= BASE && x === 16 && z === 16 && y < BASE + H ? { v: STONE, edited: true } : ground(x, y, z));
  const region = core.buildRegion(cell, 10);
  const P = core.decodeMesh(repoMesh({ ...region, params: {} }));
  const G = core.decodeMesh(gnMesh({ ...region, params: PARAMS }));
  const rows = [];
  let n45 = 0, n90 = 0, nside = 0;
  for (let v = 0; v < G.V; v++) {
    const x = G.pos[v * 3], y = G.pos[v * 3 + 1], z = G.pos[v * 3 + 2];
    if (Math.abs(x - 16.5) > 0.9 || Math.abs(z - 16.5) > 0.9 || y < BASE + 0.6 || y > BASE + H - 0.6) continue; // side vertices only
    nside++;
    const a = core.angleDeg(G.nrm[v * 3], G.nrm[v * 3 + 1], G.nrm[v * 3 + 2], P.nrm[v * 3], P.nrm[v * 3 + 1], P.nrm[v * 3 + 2]);
    if (a > 45) n45++;
    if (a > 90) n90++;
    if (Math.abs(x - 16) < 0.5 && Math.abs(z - 16) < 0.5) rows.push(`y=${(y - BASE).toFixed(2)} prod n=(${[0, 1, 2].map((k) => P.nrm[v * 3 + k].toFixed(2))}) gn n=(${[0, 1, 2].map((k) => G.nrm[v * 3 + k].toFixed(2))}) Δ${a.toFixed(0)}°`);
  }
  console.log(`1×1 column H=${H}: side vertices ${nside}, gn vs prod > 45°: ${n45}, > 90°: ${n90}`);
  for (const r of rows.sort()) console.log('   ' + r);
  renderRow(`${OUT}column-h${H}.png`, [P, G], { eye: [12.5, BASE + H * 0.6 + 1, 11], target: [16.5, BASE + H * 0.45, 16.5], fov: 55, width: 360, height: 360 });
}
