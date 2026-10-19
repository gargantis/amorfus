// vgn: which half of gn-best causes the thin-build failures? Production vs
// gn-ao (box AO, linear curve, production normals) vs vgn-aoq (gn-best AO,
// production normals) vs gn-best: shadow-side brightening of a 1×1×3 post
// and a 1-wide fence, inverted shading normals, sun-side ground halo.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS as BEST } from '../../approaches/gn-best.mjs';
import { PARAMS as AO } from '../../approaches/gn-ao.mjs';
import { PARAMS as AOQ } from '../../approaches/vgn-aoq.mjs';
import { ground, BASE, THIN } from './thin-scenes.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { normalStats } from './thin-lib.mjs';
import { STONE } from '../../harness/core.mjs';
const SUN = [0.5, 0.8, 0.3].map((x) => x / Math.hypot(0.5, 0.8, 0.3));
const L = (n, ao) => (0.9 * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) + 0.35 + 0.25 * (n[1] * 0.5 + 0.5)) * ao;
const OPEN = L([0, 1, 0], 1);
const M = { prod: (r) => repoMesh({ ...r, params: {} }), 'gn-ao': (r) => gnMesh({ ...r, params: AO }), 'aoq': (r) => gnMesh({ ...r, params: AOQ }), 'gn-best': (r) => gnMesh({ ...r, params: BEST }) };
function shadowSide(m) {
  const fn = [0, 0, 0, 0]; let n = 0, s = 0;
  for (let t = 0; t < m.T; t++) {
    core.faceNormal(m, t, fn);
    if (!(fn[3] > 1e-9) || Math.abs(fn[1]) > 0.3 || fn[0] * SUN[0] + fn[1] * SUN[1] + fn[2] * SUN[2] >= 0) continue;
    const yc = (m.pos[m.tri[t * 3] * 3 + 1] + m.pos[m.tri[t * 3 + 1] * 3 + 1] + m.pos[m.tri[t * 3 + 2] * 3 + 1]) / 3;
    if (yc < BASE + 0.3) continue;
    let ls = 0; for (let k = 0; k < 3; k++) { const v = m.tri[t * 3 + k]; ls += L([m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]], 1) / 3; }
    s += ls - L(fn, 1); n++;
  }
  return s / n;
}
function halo(m) {
  let mx = 0; const foot = [];
  for (let v = 0; v < m.V; v++) if (m.pos[v * 3 + 1] > BASE + 0.6) foot.push([m.pos[v * 3], m.pos[v * 3 + 2]]);
  for (let v = 0; v < m.V; v++) { if (Math.abs(m.pos[v * 3 + 1] - BASE) > 0.12) continue; mx = Math.max(mx, L([m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]], m.ao[v]) / OPEN); }
  return mx;
}
const post = (x, y, z) => (y >= BASE && y < BASE + 3 && x === 16 && z === 16 ? { v: STONE, edited: true } : ground(x, y, z));
const rows = [];
for (const [k, f] of Object.entries(M)) {
  const P = core.decodeMesh(f(core.buildRegion(post, 10)));
  const F = core.decodeMesh(f(core.buildRegion(THIN.find((s) => s.name === 'fence-1w-3h').cell, 10)));
  const T = core.decodeMesh(f(core.buildRegion(ALL_SCENES.find((s) => s.name === 'tower-r4.6').cell, 10)));
  let inv = 0; for (const n of ['posts-gap2', 'table', 'wall-diag-1w', 'beam-1x1-span', 'house-door-window']) inv += normalStats(core.decodeMesh(f(core.buildRegion(THIN.find((s) => s.name === n).cell, 10)))).inv;
  rows.push(`${k.padEnd(8)} post shadow-side Δlight ${shadowSide(P).toFixed(2)} | fence ${shadowSide(F).toFixed(2)} | inverted pairs (5 thin scenes) ${inv} | brightest ground near tower ×${halo(T).toFixed(3)}`);
}
console.log(rows.join('\n'));
