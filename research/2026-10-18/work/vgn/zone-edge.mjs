// vgn: what does one small edit do to the SHADING of untouched generated
// ground around it? Compare each mesher with vs without the edit, per
// lattice corner (+material), by Chebyshev distance from the edit; ground
// vertices only (corners whose 8 cells hold no edited block).
//   node work/vgn/zone-edge.mjs
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { setBlock } from './util.mjs';
import { meshWorld, renderRow } from './world.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
const seed = [1, 1];
const chunk = [-1, 1, 1];
const PLANKS = 5, AIR = 0;
// surface top at world column
function topAt(wx, wz) {
  for (let cy = 3; cy >= -1; cy--) {
    const inp = buildGenMeshInput(seed, Math.floor(wx / 32), cy, Math.floor(wz / 32), new Map(), { forceApron: 0 }).input;
    const lx = wx - Math.floor(wx / 32) * 32, lz = wz - Math.floor(wz / 32) * 32;
    for (let y = 31; y >= 0; y--) if ((inp.blocks[(y * 32 + lz) * 32 + lx] & 0xff) !== 0) return cy * 32 + y;
  }
  return null;
}
const meshers = {
  prod: (inp) => gnMesh({ ...inp, params: {} }),
  gn: (inp) => gnMesh({ ...inp, params: PARAMS }),
};
function keyed(m) {
  const d = core.decodeMesh(m);
  const map = new Map();
  for (let v = 0; v < d.V; v++) {
    if (d.flags[v] & 1) continue;
    map.set(`${m.corners[v * 3]},${m.corners[v * 3 + 1]},${m.corners[v * 3 + 2]},${d.mat[v]}`, [d.nrm[v * 3], d.nrm[v * 3 + 1], d.nrm[v * 3 + 2], d.ao[v], d.pos[v * 3], d.pos[v * 3 + 1], d.pos[v * 3 + 2]]);
  }
  return map;
}
const cases = [];
const bx = chunk[0] * 32, bz = chunk[2] * 32;
for (const [label, fn] of [
  ['one placed block', (e, x, y, z) => setBlock(e, x, y + 1, z, PLANKS)],
  ['one dug block', (e, x, y, z) => setBlock(e, x, y, z, AIR)],
  ['3x3 platform', (e, x, y, z) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setBlock(e, x + dx, topAt(x + dx, z + dz) + 1, z + dz, PLANKS); }],
]) cases.push([label, fn]);
const spots = [[bx + 12, bz + 14], [bx + 20, bz + 9], [bx + 8, bz + 22]];
for (const [label, fn] of cases) {
  const rows = { prod: new Map(), gn: new Map() };
  for (const [x, z] of spots) {
    const y = topAt(x, z);
    const e = new Map();
    fn(e, x, y, z);
    const cy = Math.floor(y / 32);
    const inE = buildGenMeshInput(seed, Math.floor(x / 32), cy, Math.floor(z / 32), e, {}).input;
    const in0 = buildGenMeshInput(seed, Math.floor(x / 32), cy, Math.floor(z / 32), new Map(), { forceApron: 10 }).input;
    const lx = x - Math.floor(x / 32) * 32, ly = y - cy * 32, lz = z - Math.floor(z / 32) * 32;
    for (const w of ['prod', 'gn']) {
      const A = keyed(meshers[w](inE)), B = keyed(meshers[w](in0));
      for (const [k, a] of A) {
        const b = B.get(k);
        if (!b) continue;
        const [cx, cyy, cz] = k.split(',').map(Number);
        // Chebyshev distance from the corner's cells to the edit block (cells cx-1..cx)
        const dist = Math.max(Math.max(0, lx - cx, cx - 1 - lx), Math.max(0, ly - cyy, cyy - 1 - ly - 1), Math.max(0, lz - cz, cz - 1 - lz));
        if (dist === 0) continue; // corner touches the edit
        const ang = core.angleDeg(a[0], a[1], a[2], b[0], b[1], b[2]);
        const moved = Math.hypot(a[4] - b[4], a[5] - b[5], a[6] - b[6]) > 1e-6;
        const r = rows[w].get(dist) ?? { n: 0, max: 0, sum: 0, over2: 0, aoMax: 0, movedN: 0 };
        r.n++; r.sum += ang; if (ang > r.max) r.max = ang; if (ang > 2) r.over2++;
        r.aoMax = Math.max(r.aoMax, Math.abs(a[3] - b[3])); if (moved) r.movedN++;
        rows[w].set(dist, r);
      }
    }
  }
  console.log(`== ${label} (3 spots on seed [1,1] chunk ${chunk}); normal change vs the same mesher without the edit, by distance from the edit`);
  for (const d of [1, 2, 3, 4, 5, 6, 7]) {
    const p = rows.prod.get(d), g = rows.gn.get(d);
    if (!p || !g) continue;
    console.log(`  d=${d}: prod mean ${(p.sum / p.n).toFixed(2)}° max ${p.max.toFixed(1)}° (>2°: ${p.over2}/${p.n}, moved ${p.movedN}, AO Δmax ${p.aoMax.toFixed(2)}) | gn mean ${(g.sum / g.n).toFixed(2)}° max ${g.max.toFixed(1)}° (>2°: ${g.over2}/${g.n}, moved ${g.movedN}, AO Δmax ${g.aoMax.toFixed(2)})`);
  }
}
