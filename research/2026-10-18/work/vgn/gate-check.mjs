// vgn: ring-gate experiment — sanity (gate off ≡ gn-best bytes), then the
// thin-build failure measures and the harness built-slope shading.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as vgnMesh } from './mesher-vgn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS as BEST } from '../../approaches/gn-best.mjs';
import { ground, BASE, THIN } from './thin-scenes.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { normalStats } from './thin-lib.mjs';
import { STONE } from '../../harness/core.mjs';
// sanity
let same = 0, n = 0;
for (const s of [...THIN, ...ALL_SCENES.filter((x) => x.kind === 'geometry')]) {
  const r = core.buildRegion(s.cell, 10);
  const a = new Uint8Array(gnMesh({ ...r, params: BEST }).vertexData), b = new Uint8Array(vgnMesh({ ...r, params: BEST }).vertexData);
  n++; if (a.length === b.length && a.every((x, i) => x === b[i])) same++;
}
console.log(`sanity: gate off ≡ gn-best on ${same}/${n} scenes`);
const SUN = [0.5, 0.8, 0.3].map((x) => x / Math.hypot(0.5, 0.8, 0.3));
const L = (nn, ao) => (0.9 * Math.max(0, nn[0] * SUN[0] + nn[1] * SUN[1] + nn[2] * SUN[2]) + 0.35 + 0.25 * (nn[1] * 0.5 + 0.5)) * ao;
const OPEN = L([0, 1, 0], 1);
function shadowSide(m) { const fn = [0, 0, 0, 0]; let k = 0, s = 0; for (let t = 0; t < m.T; t++) { core.faceNormal(m, t, fn); if (!(fn[3] > 1e-9) || Math.abs(fn[1]) > 0.3 || fn[0] * SUN[0] + fn[1] * SUN[1] + fn[2] * SUN[2] >= 0) continue; const yc = (m.pos[m.tri[t * 3] * 3 + 1] + m.pos[m.tri[t * 3 + 1] * 3 + 1] + m.pos[m.tri[t * 3 + 2] * 3 + 1]) / 3; if (yc < BASE + 0.3) continue; let ls = 0; for (let q = 0; q < 3; q++) { const v = m.tri[t * 3 + q]; ls += L([m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]], 1) / 3; } s += ls - L(fn, 1); k++; } return s / k; }
function halo(m) { let mx = 0; for (let v = 0; v < m.V; v++) { if (Math.abs(m.pos[v * 3 + 1] - BASE) > 0.12) continue; mx = Math.max(mx, L([m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]], m.ao[v]) / OPEN); } return mx; }
const post = (x, y, z) => (y >= BASE && y < BASE + 3 && x === 16 && z === 16 ? { v: STONE, edited: true } : ground(x, y, z));
const variants = { prod: (r) => repoMesh({ ...r, params: {} }), 'gn-best': (r) => gnMesh({ ...r, params: BEST }) };
for (const c of [0.7071, 0.5, 0]) variants[`gate cos≥${c}`] = (r) => vgnMesh({ ...r, params: { ...BEST, ringGate: c } });
for (const [k, f] of Object.entries(variants)) {
  const P = core.decodeMesh(f(core.buildRegion(post, 10)));
  const F = core.decodeMesh(f(core.buildRegion(THIN.find((s) => s.name === 'fence-1w-3h').cell, 10)));
  const T = core.decodeMesh(f(core.buildRegion(ALL_SCENES.find((s) => s.name === 'tower-r4.6').cell, 10)));
  let inv = 0, wt = 0; for (const nm of ['posts-gap2', 'table', 'wall-diag-1w', 'beam-1x1-span', 'house-door-window', 'tree', 'fence-1w-3h']) { const st = normalStats(core.decodeMesh(f(core.buildRegion(THIN.find((s) => s.name === nm).cell, 10)))); inv += st.inv; wt += st.wrongTop; }
  console.log(`${k.padEnd(14)} post shadow Δlight ${shadowSide(P).toFixed(2)} | fence ${shadowSide(F).toFixed(2)} | inverted pairs (7 thin) ${inv} | mean wall share w/ top texture ${(100 * wt / 7).toFixed(0)}% | tower halo ×${halo(T).toFixed(3)}`);
}
