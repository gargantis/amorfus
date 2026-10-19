// vgn: small closed objects where the 3-ring covers the whole object:
// floating 1×1×1, 1×1×2, 2×1×1, 2×2×2, and a single block on the ground.
// Report per vertex the gn normal vs production normal and vs the
// outward direction from the object's centre (ideal for a blob).
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { ground, BASE } from './thin-scenes.mjs';
import { STONE, AIR } from '../../harness/core.mjs';
import { renderRow } from './world.mjs';
import { normalStats } from './thin-lib.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
const objs = [
  ['float-1x1x1', [1, 1, 1], false], ['float-2x1x1', [2, 1, 1], false], ['float-1x2x1', [1, 2, 1], false], ['float-2x2x2', [2, 2, 2], false], ['float-3x1x1', [3, 1, 1], false],
  ['ground-1x1x1', [1, 1, 1], true], ['ground-2x1x1', [2, 1, 1], true], ['ground-2x2x1', [2, 1, 2], true],
];
for (const [name, [sx, sy, sz], onGround] of objs) {
  const y0 = onGround ? BASE : 16;
  const inside = (x, y, z) => x >= 16 && x < 16 + sx && y >= y0 && y < y0 + sy && z >= 16 && z < 16 + sz;
  const cell = (x, y, z) => (inside(x, y, z) ? { v: STONE, edited: true } : onGround ? ground(x, y, z) : { v: AIR });
  const region = core.buildRegion(cell, 10);
  const P = core.decodeMesh(repoMesh({ ...region, params: {} }));
  const G = core.decodeMesh(gnMesh({ ...region, params: PARAMS }));
  const c = [16 + sx / 2, y0 + sy / 2, 16 + sz / 2];
  let worstOut = 0, worstProd = 0, n = 0, inward = 0;
  for (let v = 0; v < G.V; v++) {
    const p = [G.pos[v * 3], G.pos[v * 3 + 1], G.pos[v * 3 + 2]];
    if (Math.abs(p[0] - c[0]) > sx / 2 + 0.6 || Math.abs(p[1] - c[1]) > sy / 2 + 0.6 || Math.abs(p[2] - c[2]) > sz / 2 + 0.6) continue;
    if (onGround && p[1] < BASE + 0.2) continue; // ground ring
    n++;
    const out = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const a = core.angleDeg(G.nrm[v * 3], G.nrm[v * 3 + 1], G.nrm[v * 3 + 2], ...out);
    const b = core.angleDeg(G.nrm[v * 3], G.nrm[v * 3 + 1], G.nrm[v * 3 + 2], P.nrm[v * 3], P.nrm[v * 3 + 1], P.nrm[v * 3 + 2]);
    if (a > 90) inward++;
    worstOut = Math.max(worstOut, a); worstProd = Math.max(worstProd, b);
  }
  const sp = normalStats(P), sg = normalStats(G);
  console.log(`${name.padEnd(13)} ${n} object vertices: gn normal vs outward-from-centre worst ${worstOut.toFixed(0)}° (${inward} point inward), vs production worst ${worstProd.toFixed(0)}°; inverted pairs prod ${sp.inv} → gn ${sg.inv}`);
  if (name === 'float-2x1x1' || name === 'ground-1x1x1' || name === 'float-1x1x1') renderRow(`${OUT}${name}.png`, [P, G], { eye: [c[0] - 3.2, c[1] + 2.2, c[2] - 2.8], target: c, fov: 50, width: 300, height: 260 });
}
