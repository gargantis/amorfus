// E1: locality of fast's one-step models and of the b1 vertex rule.
// For each (base, perturbed) scene pair: max |dD| binned by distance from
// the changed blocks (field models, n = 12 grid), and the farthest corner
// whose vertex changes (vertex rules). Bx-g20 (exact per-material lambda) is
// the non-local contrast.
//   node e1-loc.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { model, Dat, distToBlocks, vertexMap, rules, box, wideHost, bar, A, B, STONE, r4 } from './common.mjs';
import { tunnelClear } from './measure.mjs';

const [out] = process.argv.slice(2);
const slab = box(0, 0, 0, 14, 2, 5, A);
const floor1 = box(0, 0, 0, 12, 1, 12, STONE);
const ground = box(0, 0, 0, 10, 3, 10, STONE);
const seamSlab = box(0, 0, 0, 14, 2, 5, 0).map(([x, y, z]) => [x, y, z, x < 7 ? A : B]);
const without = (L, x, y, z) => L.filter((b) => !(b[0] === x && b[1] === y && b[2] === z));
const recol = (L, x, y, z, m) => L.map((b) => (b[0] === x && b[1] === y && b[2] === z ? [x, y, z, m] : b));
const PAIRS = {
  'wide-barAttached': [wideHost(), [...wideHost(), ...bar(6)], bar(6)],
  'wide-barDetached': [wideHost(), [...wideHost(), ...bar(7)], bar(7)],
  'slab-add': [slab, [...slab, [8, 2, 2, A]], [[8, 2, 2, A]]],
  'slab-remove': [slab, without(slab, 8, 1, 2), [[8, 1, 2, A]]],
  'slab-recolour': [slab, recol(slab, 8, 1, 2, B), [[8, 1, 2, B]]],
  'floor1-hole': [floor1, without(floor1, 8, 0, 8), [[8, 0, 8, STONE]]],
  'ground-pillar': [ground, [...ground, [7, 3, 7, STONE], [7, 4, 7, STONE]], [[7, 3, 7, STONE], [7, 4, 7, STONE]]],
  'seamslab-recolour': [seamSlab, recol(seamSlab, 10, 1, 2, A), [[10, 1, 2, A]]],
};
const IDS = ['A0-g20', 'Bl-g20', 'Bl-b1s20', 'Bx-g20'];
const VR = ['bub-b1-newton4', 'bub-b1-line40'];
const res = { note: 'max |dD| by distance (blocks) from the changed blocks; n = 12 model grids; vertex rules on a 38^3 region (apron 3)', pairs: {} };
for (const [name, [base, pert, changed]] of Object.entries(PAIRS)) {
  const row = { fields: {}, vertices: {} };
  for (const id of IDS) {
    const mb = model(base, id, 12), mp = model(pert, id, 12);
    if (Math.abs(mb.ox - mp.ox) > 1e-9 || Math.abs(mb.oy - mp.oy) > 1e-9 || Math.abs(mb.oz - mp.oz) > 1e-9) throw new Error('grid origins differ');
    const bins = {};
    let farthest = 0, farthestAt = null, nChanged = 0;
    const { NX, NY, NZ, n, ox, oy, oz } = mb;
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x = ox + (i + 0.5) / n, y = oy + (j + 0.5) / n, z = oz + (k + 0.5) / n;
      if (i >= mp.NX || j >= mp.NY || k >= mp.NZ) continue;
      const dv = Math.abs(mp.D[(k * mp.NY + j) * mp.NX + i] - mb.D[(k * NY + j) * NX + i]);
      const d = distToBlocks([x, y, z], changed);
      const key = (Math.floor(d / 0.25) * 0.25).toFixed(2);
      if (!bins[key] || dv > bins[key]) bins[key] = dv;
      if (dv > 1e-6) { nChanged++; if (d > farthest) { farthest = d; farthestAt = [x, y, z].map((v) => +v.toFixed(3)); } }
    }
    const binsOut = Object.fromEntries(Object.entries(bins).sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, +v.toExponential(2)]));
    row.fields[id] = { farthestChange: r4(farthest), farthestAt, cellsChanged: nChanged, maxAbsDDbyDist: binsOut,
      lambdasBase: mb.P.slice(1).map((Q) => r4(Q.lambda)), lambdasPert: mp.P.slice(1).map((Q) => r4(Q.lambda)) };
    if (name.startsWith('wide')) {
      row.fields[id].tunnelBase = tunnelClear((x, y, z) => Dat(mb, x, y, z));
      row.fields[id].tunnelPert = tunnelClear((x, y, z) => Dat(mp, x, y, z));
    }
    console.log(name, id, 'farthest', r4(farthest), 'cells', nChanged, JSON.stringify(row.fields[id].tunnelPert ?? ''));
  }
  for (const vid of VR) {
    const rule = rules[vid]();
    const vb = vertexMap(base, rule), vp = vertexMap(pert, rule);
    let far = 0, farKey = null, diffs = 0;
    const keys = new Set([...vb.keys(), ...vp.keys()]);
    for (const key of keys) {
      const a = vb.get(key), b = vp.get(key);
      const differ = !a || !b || Math.max(...a.map((v, t) => Math.abs(v - b[t]))) > 0;
      if (!differ) continue;
      diffs++;
      const p = key.split(',').map(Number);
      const d = distToBlocks(p, changed);
      if (d > far) { far = d; farKey = key; }
    }
    row.vertices[vid] = { cornersCompared: keys.size, cornersDiffering: diffs, farthestDifferingCornerDist: r4(far), farKey };
    console.log(name, vid, JSON.stringify(row.vertices[vid]));
  }
  res.pairs[name] = row;
  writeFileSync(out, JSON.stringify(res, null, 1));
}
