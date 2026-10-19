#!/usr/bin/env node
// Chunk-seam test for an approach: mesh pairs of adjacent chunks of one
// world (each from its own region, as production does) and compare every
// vertex both chunks emit on the shared plane — position, normal, AO, flags,
// material and per-vertex attrs must agree exactly.
//   node harness/seams.mjs approaches/<file>.mjs [--apron N]
// Worlds: a hinted hill with painted materials (stone disc, sand edge,
// 1-wide diagonal line) and built shapes (mound, 1:4 ramp, pit) straddling
// the x = 32 and z = 32 borders. Exit code 1 on any mismatch.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from './core.mjs';
import { clampRho } from './scenes.mjs';
import { AIR, GRASS, DIRT, STONE, SAND, PLANKS } from './core.mjs';

const args = process.argv.slice(2);
const approach = await import(pathToFileURL(resolve(args[0])).href);
const ai = args.indexOf('--apron');
const apron = ai >= 0 ? Number(args[ai + 1]) : approach.apron ?? 10;

const h = (x, z) => 9 + 4 * Math.exp(-((x - 30) ** 2 + (z - 34) ** 2) / (2 * 7 ** 2)) + 0.6 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
const plan = (x, z) => {
  if (Math.hypot(x + 0.5 - 31.2, z + 0.5 - 30.4) < 4.3) return STONE;
  if (z + 0.5 > 0.5 * (x + 0.5) + 30.7) return SAND;
  if (x - z === 6 && x > 20 && x < 44) return STONE; // 1-wide diagonal line crossing x = 32
  return GRASS;
};
const world = (x, y, z) => {
  // built shapes straddling the borders (shape-edited)
  if (Math.hypot(x + 0.5 - 33, y + 0.5 - 12, z + 0.5 - 12) < 5.2 && y >= 12) return { v: PLANKS, edited: true };
  if (z >= 40 && z < 48 && x >= 24 && x < 40 && y >= 12 && y + 0.5 < 12 + (x + 0.5 - 24) / 4) return { v: STONE, edited: true };
  if (Math.hypot(x + 0.5 - 40, y + 0.5 - 13, z + 0.5 - 31) < 4 && y < 13) return { v: AIR, edited: true };
  const d = h(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  return { v: depth <= 1 ? plan(x, z) : depth <= 4 ? DIRT : STONE, rho: clampRho(d) };
};
function meshChunk(cx, cz) {
  const region = core.buildRegion((x, y, z) => world(x + cx * 32, y, z + cz * 32), apron);
  return approach.mesh(region, null, core);
}
const q = (v) => Math.round(v * 256);
function boundaryVerts(m, axis, value, shift) {
  // Keyed by lattice corner (+ material, sharp flag) when the mesh carries
  // corners, so a POSITION mismatch is caught rather than hidden; vertices
  // without a corner (e.g. fan centres) are keyed by position. Every record
  // includes the position. Lists per key are compared sorted.
  const out = new Map();
  for (let v = 0; v < m.V; v++) {
    const p = [m.pos[v * 3] + shift[0], m.pos[v * 3 + 1], m.pos[v * 3 + 2] + shift[2]];
    const c = m.corner && m.corner[v * 3] !== undefined && m.corner[v * 3] > -1000
      ? [m.corner[v * 3] + shift[0], m.corner[v * 3 + 1], m.corner[v * 3 + 2] + shift[2]] : null;
    const onPlane = c ? c[axis] === value : Math.abs(p[axis] - value) <= 0.5;
    if (!onPlane) continue;
    const sharp = m.flags[v] & 1;
    let key = c ? `c${c[0]},${c[1]},${c[2]},m${m.mat[v]},s${sharp}` : `p${q(p[0])},${q(p[1])},${q(p[2])},m${m.mat[v]},s${sharp}`;
    if (sharp) key += `,n${m.nrm[v * 3].toFixed(2)},${m.nrm[v * 3 + 1].toFixed(2)},${m.nrm[v * 3 + 2].toFixed(2)}`;
    const rec = [q(p[0]), q(p[1]), q(p[2]), m.nrm[v * 3].toFixed(4), m.nrm[v * 3 + 1].toFixed(4), m.nrm[v * 3 + 2].toFixed(4), Math.round(m.ao[v] * 255)];
    if (m.attrs) for (let d = 0; d < m.attrDim; d++) rec.push(Number(m.attrs[v * m.attrDim + d]).toFixed(5));
    const list = out.get(key);
    if (list) list.push(rec.join('|')); else out.set(key, [rec.join('|')]);
  }
  for (const [k, list] of out) out.set(k, list.sort().join(' ; '));
  return out;
}
let bad = 0;
for (const [label, a, b, axis] of [['x-border', [0, 0], [1, 0], 0], ['z-border', [0, 0], [0, 1], 2], ['x-border, z=1', [0, 1], [1, 1], 0]]) {
  const ma = meshChunk(...a), mb = meshChunk(...b);
  const sa = [a[0] * 32, 0, a[1] * 32], sb = [b[0] * 32, 0, b[1] * 32];
  const border = (axis === 0 ? b[0] : b[1]) * 32;
  const va = boundaryVerts(ma, axis, border, sa), vb = boundaryVerts(mb, axis, border, sb);
  let shared = 0, diff = 0;
  for (const [k, rec] of va) {
    const o = vb.get(k);
    if (o === undefined) continue;
    shared++;
    if (o !== rec) { diff++; if (diff <= 3) console.log(`  ${label} mismatch at ${k}: ${rec}  vs  ${o}`); }
  }
  console.log(`${label}: ${shared} shared vertices, ${diff} mismatched (apron ${apron})`);
  if (shared < 20) console.log('  WARNING: few shared vertices; the test may not be exercising this border');
  bad += diff;
}
process.exitCode = bad > 0 ? 1 : 0;
