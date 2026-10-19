#!/usr/bin/env node
// vmf: seam test at PRODUCTION aprons. Each chunk is meshed from its own
// region with the apron production would choose: 10 if a shape-edited block
// lies within 10 of the chunk's box, else the approach's unedited apron
// (mf-iso: 6). Painted (material-only) patterns and the surface cross x, z AND
// y borders. Every vertex two chunks emit on a shared plane (keyed by lattice
// corner, material, sharp) must agree in position, normal, AO and attrs.
//   node work/vmf/seams-prod.mjs approaches/mf-iso.mjs [--unedited N]
import * as core from '../../harness/core.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { loadApproach } from './lib.mjs';
const { AIR, GRASS, DIRT, STONE, SAND, PLANKS, BRICK, SHARP_BIT } = core;
const args = process.argv.slice(2);
const A = await loadApproach(args[0]);
const ui = args.indexOf('--unedited');
const UNEDITED = ui >= 0 ? Number(args[ui + 1]) : A.apron ?? 10;
// surface around y = 32 so y-borders are crossed; paints straddle x = 32 / z = 32
const h = (x, z) => 31.3 + 3.2 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + 2 * Math.exp(-((x - 33) ** 2 + (z - 31) ** 2) / 30);
const paint = (x, z) => {
  if (x - z === 1 && x > 20 && x < 46) return STONE; // 1-wide diagonal across both borders
  if (Math.abs(z - 32) <= 0 && x > 18 && x < 46) return SAND; // 1-wide line on the z border
  if ((x + z) % 2 === 0 && x >= 28 && x < 36 && z >= 36 && z < 44) return PLANKS; // checker across x = 32
  if (x >= 29 && x < 35 && z >= 24 && z < 27 && ((x * 7 + z * 3) % 5 === 0)) return BRICK | SHARP_BIT;
  if (Math.hypot(x + 0.5 - 32, z + 0.5 - 20) < 3.4) return STONE;
  return GRASS;
};
const edits = (x, y, z) => {
  // a built planks wall crossing x = 32 at z ≈ 50 (only chunks near it are 'edited')
  if (z === 50 && x >= 26 && x < 40 && y >= 33 && y < 37) return { v: PLANKS, edited: true };
  return null;
};
const world = (x, y, z) => {
  const e = edits(x, y, z);
  if (e) return e;
  const d = h(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  return { v: depth <= 1 ? paint(x, z) : depth <= 4 ? DIRT : STONE, rho: clampRho(d) };
};
const editedNear = (cx, cy, cz) => {
  // any shape-edited block within 10 of the chunk box
  for (let y = cy * 32 - 10; y < cy * 32 + 42; y++) for (let z = cz * 32 - 10; z < cz * 32 + 42; z++) for (let x = cx * 32 - 10; x < cx * 32 + 42; x++) {
    if (z !== 50 || y < 33 || y >= 37 || x < 26 || x >= 40) continue;
    return true;
  }
  return false;
};
const cache = new Map();
function meshChunk(cx, cy, cz) {
  const k = `${cx},${cy},${cz}`;
  if (cache.has(k)) return cache.get(k);
  const apron = editedNear(cx, cy, cz) ? 10 : UNEDITED;
  const region = core.buildRegion((x, y, z) => world(x + cx * 32, y + cy * 32, z + cz * 32), apron);
  const m = A.mesh(region, null, core);
  m.apronUsed = apron;
  cache.set(k, m);
  return m;
}
const q = (v) => Math.round(v * 256);
function planeVerts(m, axis, value, shift) {
  const out = new Map();
  for (let v = 0; v < m.V; v++) {
    if (!m.corner || m.corner[v * 3] < -1000) continue; // fan centres are never shared
    const c = [m.corner[v * 3] + shift[0], m.corner[v * 3 + 1] + shift[1], m.corner[v * 3 + 2] + shift[2]];
    if (c[axis] !== value) continue;
    const sharp = m.flags[v] & 1;
    let key = `c${c.join(',')},m${m.mat[v]},s${sharp}`;
    if (sharp) key += `,n${m.nrm[v * 3].toFixed(2)},${m.nrm[v * 3 + 1].toFixed(2)},${m.nrm[v * 3 + 2].toFixed(2)}`;
    const rec = [q(m.pos[v * 3] + shift[0]), q(m.pos[v * 3 + 1] + shift[1]), q(m.pos[v * 3 + 2] + shift[2]), m.nrm[v * 3].toFixed(4), m.nrm[v * 3 + 1].toFixed(4), m.nrm[v * 3 + 2].toFixed(4), Math.round(m.ao[v] * 255)];
    if (m.attrs) for (let d = 0; d < m.attrDim; d++) rec.push(Math.round(m.attrs[v * m.attrDim + d] * 30));
    (out.get(key) ?? out.set(key, []).get(key)).push(rec.join('|'));
  }
  for (const [k, l] of out) out.set(k, l.sort().join(';'));
  return out;
}
let total = 0, bad = 0, attrBad = 0;
const pairs = [];
for (const cy of [0, 1]) for (const cz of [0, 1]) for (const cx of [0, 1]) {
  for (const ax of [0, 1, 2]) {
    const n = [cx, cy, cz]; n[ax]++;
    if (n[ax] > 1) continue;
    pairs.push([[cx, cy, cz], n, ax]);
  }
}
for (const [a, b, ax] of pairs) {
  const ma = meshChunk(...a), mb = meshChunk(...b);
  const sa = a.map((v) => v * 32), sb = b.map((v) => v * 32);
  const plane = b[ax] * 32;
  const va = planeVerts(ma, ax, plane, sa), vb = planeVerts(mb, ax, plane, sb);
  let shared = 0, diff = 0, ad = 0;
  for (const [k, r] of va) {
    const o = vb.get(k);
    if (o === undefined) continue;
    shared++;
    if (o !== r) {
      diff++;
      const ra = r.split('|').slice(7).join('|'), rb = o.split('|').slice(7).join('|');
      if (ra !== rb) ad++;
      if (diff <= 2) console.log(`  mismatch ${k}: ${r} vs ${o}`);
    }
  }
  total += shared; bad += diff; attrBad += ad;
  console.log(`${a} | ${b} (axis ${'xyz'[ax]}, aprons ${ma.apronUsed}/${mb.apronUsed}): ${shared} shared, ${diff} mismatched (${ad} in attrs)`);
}
console.log(`TOTAL ${total} shared vertices, ${bad} mismatched, ${attrBad} with attr mismatches (unedited apron ${UNEDITED})`);
process.exitCode = bad ? 1 : 0;
