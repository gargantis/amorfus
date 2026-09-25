import { meshChunk, worldPos, watertight } from './sn.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
const P = (m, x, y, z) => { for (let v = 0; v < m.V; v++) if (m.cx[v] + m.bx0 === x && m.cy[v] + m.by0 === y && m.cz[v] + m.bz0 === z) return worldPos(m, v); return null; };
const f = (x, y, z) => 0.3 - (z + 0.5); // hinted ground at 0.3
const blk = (x, y, z) => x === 0 && y === 0 && z === 0;
for (const mode of ['vertex', 'axis']) {
  // sharp placed block (edited) on hinted ground; closed region: bounded ground slab to allow watertight test
  const inR = (x, y, z) => Math.max(Math.abs(x + .5), Math.abs(y + .5)) < 5 && z >= -3;
  const occ = (x, y, z) => (!inR(x, y, z) ? 0 : blk(x, y, z) ? 2 : f(x, y, z) > 0 ? 1 : 0);
  const m = meshChunk(occ, -7, -7, -7, 14, { k: 4, guard: G1, hint: f, edited: blk, hintedLambda: 0, hAir: null, sharpMode: mode });
  let planar = 0, bad = 0;
  for (const q of m.quads) if (q.sharp) { const n = q.solid.map((s, i) => q.air[i] - s); const a = n.findIndex(t => t !== 0);
    const plane = Math.max(q.solid[a], q.air[a]); for (const v of q.v) { if (worldPos(m, v)[a] !== plane) bad++; else planar++; } }
  const base = P(m, 0, 0, 0), top = P(m, 0, 0, 1), gr = P(m, -1, 0, 0);
  console.log(`${mode.padEnd(6)} watertight viol ${watertight(m)} | sharp-face verts on exact plane ${planar}, off-plane ${bad} | block base corner z ${base[2].toFixed(2)} top corner ${top.map(t => t.toFixed(2))} | ground 1 block away z ${gr[2].toFixed(2)} (hint 0.30)`);
}
