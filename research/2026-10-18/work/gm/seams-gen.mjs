// Generator-based seam test for gm (and any approach): mesh pairs of
// adjacent chunks of the REAL world (seed 1,1) from the extended GEN_MESH
// input (production builder + material planes), each from its own region,
// and compare every vertex both chunks emit on the shared plane. Key:
// lattice corner + material + sharp flag + MODE (attrs[0]; a gen and a
// fallback copy of a corner are different vertices); record: position
// (1/256), normal, AO, every attribute. Cases: no edits at aprons 3/6/10;
// edits straddling a border (apron by the gm rule: any edit within reach →
// 10); neighbours at DIFFERENT aprons (one has an edit within reach, the
// other does not). Exit code 1 on any mismatch.
//   node work/gm/seams-gen.mjs approaches/<file>.mjs
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { surfaceY } from './edits.mjs';
const A = await import(pathToFileURL(resolve(process.argv[2])).href);
const q = (v) => Math.round(v * 256);
function verts(m, shift, axis, value) {
  const out = new Map();
  const dim = m.attrDim ?? 0;
  for (let v = 0; v < m.V; v++) {
    const c = m.corner && m.corner[v * 3] > -1000 ? [m.corner[v * 3] + shift[0], m.corner[v * 3 + 1] + shift[1], m.corner[v * 3 + 2] + shift[2]] : null;
    const p = [m.pos[v * 3] + shift[0], m.pos[v * 3 + 1] + shift[1], m.pos[v * 3 + 2] + shift[2]];
    if (c ? c[axis] !== value : Math.abs(p[axis] - value) > 0.5) continue;
    const mode = dim ? (m.attrs[v * dim] > 0.5 ? 'g' : 'f') : '-';
    const sharp = m.flags[v] & 1;
    let key = c ? `c${c.join(',')},m${m.mat[v]},s${sharp},${mode}` : `p${p.map(q).join(',')},m${m.mat[v]},${mode}`;
    if (sharp) key += `,n${m.nrm[v * 3].toFixed(2)},${m.nrm[v * 3 + 1].toFixed(2)},${m.nrm[v * 3 + 2].toFixed(2)}`;
    const rec = [...p.map(q), m.nrm[v * 3].toFixed(4), m.nrm[v * 3 + 1].toFixed(4), m.nrm[v * 3 + 2].toFixed(4), Math.round(m.ao[v] * 255)];
    for (let d = 0; d < dim; d++) rec.push(m.attrs[v * dim + d].toFixed(6));
    (out.get(key) ?? out.set(key, []).get(key)).push(rec.join('|'));
  }
  for (const [k, l] of out) out.set(k, l.sort().join(';'));
  return out;
}
function meshAt(c, edits, apron) {
  const opts = apron === undefined ? { gmApron: true } : { forceApron: apron };
  const g = buildGenMeshInputGM([1, 1], c[0], c[1], c[2], edits, opts);
  return { m: A.mesh(g.input, null, core), apron: g.apron };
}
function pair(label, a, b, edits = new Map(), apA, apB) {
  const axis = a[0] !== b[0] ? 0 : a[1] !== b[1] ? 1 : 2;
  const ma = meshAt(a, edits, apA), mb = meshAt(b, edits, apB);
  const border = b[axis] * 32;
  const va = verts(ma.m, a.map((x) => x * 32), axis, border), vb = verts(mb.m, b.map((x) => x * 32), axis, border);
  let shared = 0, diff = 0, gen = 0;
  for (const [k, r] of va) { const o = vb.get(k); if (o === undefined) continue; shared++; if (k.endsWith(',g') || k.includes(',g,')) gen++; if (o !== r) { diff++; if (diff <= 2) console.log(`   mismatch ${k}\n     ${r}\n     ${o}`); } }
  console.log(`${label}: ${shared} shared (${gen} gen-mode), ${diff} mismatched (aprons ${ma.apron}/${mb.apron})`);
  return diff;
}
const key = (x, y, z) => `${x},${y},${z}`;
let bad = 0;
const PAIRS = [[[-1, 1, 1], [0, 1, 1]], [[-1, 1, 1], [-1, 1, 2]], [[0, 0, -3], [1, 0, -3]], [[0, 0, -3], [0, 0, -2]], [[-2, 1, 1], [-2, 2, 1]], [[0, 0, 0], [0, 1, 0]], [[-3, 1, 0], [-2, 1, 0]], [[1, 0, 0], [1, 0, 1]]];
for (const ap of [3, 6, 10]) for (const [a, b] of PAIRS) bad += pair(`no edits, ${a}|${b}`, a, b, new Map(), ap, ap);
// edits straddling borders: a painted diagonal crossing x = 0 (world), planks across z = 32, a pit at x = 0
const E1 = new Map();
for (let t = -8; t < 8; t++) { const x = t, z = -96 + 10 + t; E1.set(key(x, surfaceY(x, z), z), 3); } // beach chunk (0,0,−3) / (−1,0,−3)
for (let a = -2; a < 2; a++) { const x = a, z = -96 + 20; E1.set(key(x, surfaceY(x, z) + 1, z), 5); }
const E2 = new Map();
for (let a = -2; a < 2; a++) for (let b = 50; b < 54; b++) { const x = -32 + 14 + a, z = b; const y = surfaceY(x, z); for (let d = 0; d < 4; d++) E2.set(key(x, y - d, z), 0); }
for (let t = 0; t < 12; t++) { const x = -32 + 6 + t, z = 58 + t; E2.set(key(x, surfaceY(x, z), z), 6); } // 1:1 brick line crossing z = 64
bad += pair('edits across x=0 (paint + planks)', [-1, 0, -3], [0, 0, -3], E1);
bad += pair('edits across z=64 (pit + brick line)', [-1, 1, 1], [-1, 1, 2], E2);
// different aprons: B has an edit within reach, A does not (the gm rule picks 10 for B, 3 for A)
const E3 = new Map();
{ const x = 32 + 20, z = 32 + 16; E3.set(key(x, surfaceY(x, z), z), 3); } // in chunk (1,·,1), 20 blocks from x = 32
bad += pair('mixed aprons (edit 20 blocks inside B)', [0, 1, 1], [1, 1, 1], E3);
process.exitCode = bad ? 1 : 0;
console.log(bad ? `FAIL: ${bad} mismatched` : 'all shared vertices identical');
