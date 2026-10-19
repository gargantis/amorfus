// Quadratic vs linear AO onset on the stack geometry.
//  1. CONTACT SHADOWS (work/vgn/contact.mjs's builds on hinted flat ground):
//     mean ground AO by Chebyshev distance 0–3 from the footprint;
//     production (hints + lattice AO), stack-q, stack-l.
//  2. AO ROUGHNESS (harness metric: each vertex's AO minus the mean of its
//     mesh neighbours, rms; vertices merged by quantised position):
//     16 bench chunks (all vertices), gh's edit scenarios (mountain, town).
//  3. How much AO open ground keeps: mean AO and share below 0.9 of
//     up-facing (n_y > 0.7) vertices on the bench chunks.
import * as core from '../../harness/core.mjs';
import { ground, BASE } from '../vgn/thin-scenes.mjs';
import { STONE, PLANKS } from '../../harness/core.mjs';
import { buildGenMeshInputGM } from '../gm/input.mjs';
import { BENCH } from '../gm/terrain-metrics.mjs';
import { ghInputs } from './edits.mjs';
import * as Q from '../../approaches/stack-base-q.mjs';
import * as L from '../../approaches/stack-base-l.mjs';
const prod = { name: 'production', mesh: (r) => core.decodeMesh(core.meshRegion({ ...r, params: {} })) };
const mods = [prod, Q, L];
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—');

console.log('## 1. Contact shadows: mean ground AO at Chebyshev distance 0 / 1 / 2 / 3 from the footprint');
console.log(`| build | ${mods.map((m) => m.name).join(' | ')} |\n|---|${mods.map(() => '---').join('|')}|`);
for (const [name, foot, H, v] of [
  ['1×1 post, 3 high', (x, z) => x === 16 && z === 16, 3, PLANKS],
  ['1-wide fence, 3 high', (x, z) => x === 16 && z >= 8 && z < 24, 3, PLANKS],
  ['single block', (x, z) => x === 16 && z === 16, 1, STONE],
  ['4×4 block, 3 high', (x, z) => x >= 14 && x < 18 && z >= 14 && z < 18, 3, STONE],
  ['2-high wall, 1 thick', (x, z) => z === 16 && x >= 8 && x < 24, 2, STONE],
]) {
  const cell = (x, y, z) => (y >= BASE && y < BASE + H && foot(x, z) ? { v, edited: true } : ground(x, y, z));
  const r = core.buildRegion(cell, 10);
  const dist = (x, z) => { let d = 99; for (let bx = 4; bx < 28; bx++) for (let bz = 4; bz < 28; bz++) if (foot(bx, bz)) d = Math.min(d, Math.max(Math.max(0, bx - x, x - (bx + 1)), Math.max(0, bz - z, z - (bz + 1)))); return d; };
  const cells = mods.map((M) => {
    const m = M.mesh(r, null, core);
    const b = [[], [], [], []];
    for (let v = 0; v < m.V; v++) { if (Math.abs(m.pos[v * 3 + 1] - BASE) > 0.3 || m.nrm[v * 3 + 1] < 0.7) continue; const d = Math.round(dist(m.pos[v * 3], m.pos[v * 3 + 2])); if (d < 4) b[d].push(m.ao[v]); }
    return b.map((a) => (a.length ? f2(a.reduce((p, q) => p + q, 0) / a.length) : '—')).join(' / ');
  });
  console.log(`| ${name} | ${cells.join(' | ')} |`);
}

const qkey = (pos, v) => `${Math.round(pos[v * 3] * 256)},${Math.round(pos[v * 3 + 1] * 256)},${Math.round(pos[v * 3 + 2] * 256)}`;
function rough(m) {
  const byKey = new Map(), nb = new Map();
  for (let v = 0; v < m.V; v++) { const k = qkey(m.pos, v); if (!byKey.has(k)) byKey.set(k, m.ao[v]); }
  for (let t = 0; t < m.T; t++) for (let e = 0; e < 3; e++) {
    const ka = qkey(m.pos, m.tri[t * 3 + e]), kb = qkey(m.pos, m.tri[t * 3 + ((e + 1) % 3)]);
    if (!nb.has(ka)) nb.set(ka, new Set()); if (!nb.has(kb)) nb.set(kb, new Set());
    nb.get(ka).add(kb); nb.get(kb).add(ka);
  }
  let s2 = 0, n = 0;
  for (const [k, set] of nb) { const a = byKey.get(k); let s = 0, c = 0; for (const o of set) { s += byKey.get(o); c++; } if (c) { s2 += (a - s / c) ** 2; n++; } }
  return { s2, n };
}
console.log('\n## 2. AO roughness (rms of AO minus neighbour mean) and 3. open-ground AO');
const acc = mods.map(() => ({ s2: 0, n: 0, up: [], below: 0 }));
for (const c of BENCH) {
  const inp = buildGenMeshInputGM([1, 1], ...c, new Map(), { forceApron: 10 }).input;
  mods.forEach((M, k) => {
    const m = M.mesh(inp, null, core);
    const r = rough(m); acc[k].s2 += r.s2; acc[k].n += r.n;
    for (let v = 0; v < m.V; v++) if (m.nrm[v * 3 + 1] > 0.7) { acc[k].up.push(m.ao[v]); if (m.ao[v] < 0.9) acc[k].below++; }
  });
}
const edits = {};
for (const s of ['mountain', 'town']) {
  const inp = ghInputs(s, 10)[0];
  edits[s] = mods.map((M) => { const r = rough(M.mesh(inp, null, core)); return Math.sqrt(r.s2 / r.n); });
}
console.log(`| metric | ${mods.map((m) => m.name).join(' | ')} |\n|---|${mods.map(() => '---').join('|')}|`);
console.log(`| AO roughness, 16 bench chunks | ${acc.map((a) => f3(Math.sqrt(a.s2 / a.n))).join(' | ')} |`);
for (const s of Object.keys(edits)) console.log(`| AO roughness, edit scenario ${s} | ${edits[s].map(f3).join(' | ')} |`);
console.log(`| up-facing vertices: mean AO | ${acc.map((a) => f3(a.up.reduce((p, q) => p + q, 0) / a.up.length)).join(' | ')} |`);
console.log(`| up-facing vertices: share with AO < 0.9 | ${acc.map((a) => `${(100 * a.below / a.up.length).toFixed(1)} %`).join(' | ')} |`);
