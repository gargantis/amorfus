#!/usr/bin/env node
// Apron sufficiency + seam test for a gh variant (work/gh/variants.mjs).
//   node work/gh/seams-gh.mjs <variant> [apron] [bigApron=24]
// World: built shapes straddling the chunk borders x = 32 and z = 32 on
// off-lattice hinted ground: a mound on the chunk corner, 1:4 and 1:8 ramps
// crossing x = 32 (the 1:8 one with a riser 8 blocks from the border), a
// terrace disc, a tower on the border, a wide flat built platform crossing
// z = 32 (plateau edges far from every contour: full-radius searches), a dug
// 1:1 staircase crossing x = 32, and a random built heightfield along both
// seams (after the gs seam tool).
// (1) apron sufficiency: each of 4 chunks meshed at `apron` must be
//     byte-identical to the same chunk meshed at bigApron;
// (2) seams: vertices shared between adjacent chunks (keyed by lattice
//     corner and material) must match in position, normal and AO.
import { VARIANTS } from './variants.mjs';
import * as core from '../../harness/core.mjs';
const name = process.argv[2];
const v = VARIANTS[name];
if (!v) throw new Error(`unknown variant ${name}`);
const A = Number(process.argv[3] ?? v.apron ?? 10);
const BIG = Number(process.argv[4] ?? 24);
const BASE = 6, AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, PLANKS = 5;
const clampRho = (d) => { const q = Math.max(-1, Math.min(1, d / 4)); return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q; };
function ground(x, y, z) {
  const top = BASE + 0.3 + 0.15 * Math.sin(x * 0.21) * Math.cos(z * 0.17);
  const d = top - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) };
}
const hash = (x, z) => { let h = Math.imul(x * 374761393 + z * 668265263, 1274126177) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h >>> 8) / 16777216; };
const rubble = (x, z) => {
  if (!((x >= 24 && x < 40) || (z >= 24 && z < 40))) return 0;
  if (x < 0 || z < 0 || x >= 64 || z >= 64) return 0;
  const f = (a, b) => Math.floor(hash(a >> 1, b >> 1) * 4);
  return Math.round((f(x, z) + f(x + 1, z) + f(x, z + 1) + f(x + 1, z + 1)) / 4);
};
function world(x, y, z) {
  const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
  // dug 1:1 staircase going down across x = 32 at z ∈ [56, 60)
  if (z >= 56 && z < 60 && x >= 26 && x < 40 && y < BASE && y >= BASE - Math.min(6, x - 25)) return { v: AIR, edited: true };
  if (y >= BASE && y < BASE + rubble(x, z) && !(Math.hypot(cx - 32.2, cz - 31.7) < 8)) return { v: STONE, edited: true };
  if (y >= BASE) {
    if (Math.hypot(cx - 32.2, cy - BASE, cz - 31.7) < 6.4) return { v: STONE, edited: true };
    if (cz >= 4 && cz < 14 && cx >= 20 && cy < BASE + Math.min(24, cx - 20) / 4) return { v: STONE, edited: true };
    if (cz >= 44 && cz < 54 && cx >= 16 && cy < BASE + Math.min(40, cx - 16) / 8) return { v: STONE, edited: true };
    if (y === BASE && Math.hypot(cx - 46, cz - 46) < 5.3) return { v: STONE, edited: true };
    if (y < BASE + 5 && Math.hypot(cx - 31.8, cz - 46) < 3.6) return { v: STONE, edited: true };
    if (y === BASE && x >= 4 && x < 20 && z >= 16 && z < 48) return { v: PLANKS, edited: true };
  }
  return ground(x, y, z);
}
const region = (ci, ck, apron) => core.buildRegion((x, y, z) => world(ci * 32 + x, y, ck * 32 + z), apron);
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const meshes = {};
let insufficient = 0;
for (const [ci, ck] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
  const m = v.raw(region(ci, ck, A));
  const mb = v.raw(region(ci, ck, BIG));
  const ok = same(new Uint8Array(m.vertexData), new Uint8Array(mb.vertexData)) && same(m.indexData, mb.indexData);
  let nd = 0;
  if (!ok) {
    const a = new Uint8Array(m.vertexData), b = new Uint8Array(mb.vertexData);
    const V = Math.min(m.vertexCount, mb.vertexCount);
    for (let k = 0; k < V; k++) for (let j = 0; j < 16; j++) if (a[k * 16 + j] !== b[k * 16 + j]) { nd++; break; }
    insufficient++;
  }
  console.log(`chunk ${ci},${ck}: apron ${A} vs ${BIG}: ${ok ? 'identical' : `DIFFERENT (${nd} of ${m.vertexCount} vertices; counts ${m.vertexCount}/${mb.vertexCount})`}`);
  meshes[`${ci},${ck}`] = core.decodeMesh(m);
}
let bad = 0, shared = 0;
for (const [a, b, axis] of [['0,0', '1,0', 0], ['0,0', '0,1', 2], ['1,0', '1,1', 2], ['0,1', '1,1', 0]]) {
  const ma = meshes[a], mb = meshes[b];
  const [ax, az] = a.split(',').map(Number), [bx, bz] = b.split(',').map(Number);
  const border = axis === 0 ? bx * 32 : bz * 32;
  const rec = (m, k, sx, sz) => {
    const out = new Map();
    for (let i = 0; i < m.V; i++) {
      const c = [m.corner[i * 3] + sx, m.corner[i * 3 + 1], m.corner[i * 3 + 2] + sz];
      if (c[axis] !== border) continue;
      const key = `${c.join(',')},m${m.mat[i]},s${m.flags[i] & 1}`;
      const val = [0, 1, 2].map((d) => Math.round((m.pos[i * 3 + d] + (d === 0 ? sx : d === 2 ? sz : 0)) * 256)).join(',') + '|' +
        [0, 1, 2].map((d) => m.nrm[i * 3 + d].toFixed(5)).join(',') + '|' + Math.round(m.ao[i] * 255);
      out.set(key, val);
    }
    return out;
  };
  const ra = rec(ma, a, ax * 32, az * 32), rb = rec(mb, b, bx * 32, bz * 32);
  let s = 0, d = 0;
  for (const [k, val] of ra) { const o = rb.get(k); if (o === undefined) continue; s++; if (o !== val) { d++; if (d <= 2) console.log(`  ${a}|${b} mismatch ${k}: ${val} vs ${o}`); } }
  console.log(`seam ${a}|${b}: ${s} shared vertices, ${d} mismatched`);
  shared += s; bad += d;
}
console.log(`${name}: apron ${A}: ${insufficient} of 4 chunks differ from apron ${BIG}; seams ${shared} shared, ${bad} mismatched`);
process.exitCode = insufficient + bad > 0 ? 1 : 0;
