// Seam test: a vertex shared by two adjacent chunks must get identical
// bytes (position, AO, flags, normal, material) from either chunk's region.
// Cases: unedited (apron 3 both), edits straddling the boundary (apron 10
// both), an edit near one chunk only (apron 10 vs apron 3).
//   node work/gn/seams.mjs <set> <variant>
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion } from './mesher-gn.mjs';
import { SETS } from './variants.mjs';
const [set, vn] = process.argv.slice(2);
const params = SETS[set][vn];
const base = { ...params, normalRule: 'area', fastShade: false }; // same AO, production normals: counts vertices on the alternative normal path
const CX_MIN = -(2 ** 18), CX_SPAN = 2 ** 19, CY_MIN = -8, CY_SPAN = 24;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
const local = (x, y, z) => (y * 32 + z) * 32 + x;
function setBlock(edits, wx, wy, wz, v) {
  const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32), cz = Math.floor(wz / 32);
  const k = key(cx, cy, cz);
  if (!edits.has(k)) edits.set(k, new Map());
  edits.get(k).set(local(wx - cx * 32, wy - cy * 32, wz - cz * 32), v);
}
const STONE = 3, AIR = 0, PLANKS = 5;
function vertsOf(c, edits, prm = params) {
  const { input, apron } = buildGenMeshInput([1, 1], ...c, edits, {});
  const m = meshRegion({ ...input, params: prm });
  const u8 = new Uint8Array(m.vertexData), u16 = new Uint16Array(m.vertexData);
  const map = new Map();
  for (let v = 0; v < m.vertexCount; v++) {
    const p = [u16[v * 8], u16[v * 8 + 1], u16[v * 8 + 2]];
    const flags = u8[v * 16 + 7];
    const sharp = flags & 1;
    const k = `${c[0] * 8192 + p[0]},${c[1] * 8192 + p[1]},${c[2] * 8192 + p[2]},${u8[v * 16 + 12]},${sharp},${sharp ? `${u8[v * 16 + 8]},${u8[v * 16 + 9]},${u8[v * 16 + 10]},${u8[v * 16 + 11]}` : ''}`;
    const val = [u8[v * 16 + 6], flags, u8[v * 16 + 8], u8[v * 16 + 9], u8[v * 16 + 10], u8[v * 16 + 11]].join(',');
    map.set(k, val);
  }
  return { map, apron, V: m.vertexCount };
}
function compare(label, a, b, edits) {
  const A = vertsOf(a, edits), B = vertsOf(b, edits);
  const A0 = vertsOf(a, edits, base);
  let shared = 0, aoDiff = 0, nDiff = 0, fDiff = 0, alt = 0;
  for (const [k, va] of A.map) {
    const vb = B.map.get(k);
    if (vb === undefined) continue;
    shared++;
    if (A0.map.get(k) !== va) alt++;
    const x = va.split(','), y = vb.split(',');
    if (x[0] !== y[0]) aoDiff++;
    if (x[1] !== y[1]) fDiff++;
    if (x.slice(2).join() !== y.slice(2).join()) nDiff++;
  }
  console.log(`${label}: aprons ${A.apron}/${B.apron}, shared ${shared} (${alt} on the edit-zone path), AO diff ${aoDiff}, normal diff ${nDiff}, flag diff ${fDiff}`);
  return aoDiff + nDiff + fDiff + (shared === 0 ? 1 : 0);
}
let bad = 0;
// find neighbour pairs whose shared boundary carries surface
const cands = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1], [0, 0, 2], [1, 0, 1], [-2, 0, 0]];
const pairs = [];
for (const [ax, d] of [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]]) {
  let best = null;
  for (const c of cands) {
    const n = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
    const A = vertsOf(c, new Map(), base), B = vertsOf(n, new Map(), base);
    let sh = 0; for (const k of A.map.keys()) if (B.map.has(k)) sh++;
    if (!best || sh > best[3]) best = [ax, c, n, sh];
  }
  pairs.push(best.slice(0, 3));
}
for (const [ax, a, b] of pairs) {
  bad += compare(`unedited ${ax}`, a, b, new Map());
  // edits straddling the boundary: a wall + a pillar + a dug trench through the surface band
  const edits = new Map();
  const d = ax.startsWith('x') ? [1, 0, 0] : ax === 'z' ? [0, 0, 1] : [0, 1, 0];
  const bx = b[0] * 32, by = b[1] * 32, bz = b[2] * 32;
  for (let t = -3; t < 3; t++) for (let s = 0; s < 6; s++) for (let h = 0; h < 40; h++) {
    // a slab of material crossing the boundary plane, alternating stone / air every 3 rows
    const off = [t, t, t];
    const wx = ax.startsWith('x') ? bx + t : bx + 8 + s;
    const wy = ax === 'y' ? by + t : by - 8 + h;
    const wz = ax === 'z' ? bz + t : bz + 8 + s + (ax === 'y' ? h % 6 : 0);
    if (ax === 'y' && h > 5) continue;
    const v = (h + s) % 7 < 3 ? AIR : (h + s) % 7 === 3 ? PLANKS : STONE;
    setBlock(edits, ax === 'y' ? bx + 8 + h : wx, wy, wz, v);
  }
  bad += compare(`edited ${ax}`, a, b, edits);
  // an edit near chunk a's far side only: a gets apron 10, b apron 3
  const e2 = new Map();
  const ac = [a[0] * 32, a[1] * 32, a[2] * 32];
  for (let h = 0; h < 32; h++) setBlock(e2, ac[0] + 3 + (ax.startsWith('x') ? 0 : 10), ac[1] + h, ac[2] + 3 + (ax === 'z' ? 0 : 10), STONE);
  bad += compare(`one-sided ${ax}`, a, b, e2);
}
console.log(bad === 0 ? 'SEAMS OK' : `SEAM FAILURES: ${bad}`);
