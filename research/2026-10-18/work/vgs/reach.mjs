// VGS: empirical influence radius of ONE edit. Mesh a chunk with and
// without a single added edit at b (inside the chunk, among other edits),
// compare every emitted vertex by (lattice corner, material, sharp) and
// report the farthest changed vertex (Chebyshev, lattice corner − b, per
// side). The dirty set assumes changes stay within [b−9, b+10].
//   node work/vgs/reach.mjs [variants] [trials]
import { VARIANTS, clampRho, AIR, GRASS, DIRT, STONE, PLANKS } from './phys.mjs';
const [vs = 'hints,gs-ctx,gs-mls', tr = '24'] = process.argv.slice(2);
const TRIALS = Number(tr);
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const hash = (x, y, z) => { let h = Math.imul(x * 374761393 + y * 1103515245 + z * 668265263, 1274126177) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h >>> 8) / 16777216; };
const base = (x, y, z) => {
  const xc = x + 0.5, zc = z + 0.5, yc = y + 0.5;
  const H = 14 + 2.5 * Math.sin(xc * 0.21) * Math.cos(zc * 0.17);
  // a built quarter: random built heightfield 1–4 high over x,z in [8, 24)
  if (x >= 8 && x < 24 && z >= 8 && z < 24 && y >= Math.floor(H) && y < Math.floor(H) + 1 + Math.floor(hash(x >> 1, 0, z >> 1) * 4)) return { v: STONE, edited: true };
  const d = H - yc;
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) };
};
function region(fn, A = 10) {
  const n = 32 + 2 * A;
  const blocks = new Uint16Array(n * n * n), rho = new Float32Array(n * n * n), shapeEdited = new Uint8Array(n * n * n);
  for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const c = fn(x - A, y - A, z - A);
    const i = (y * n + z) * n + x;
    blocks[i] = c.v; rho[i] = c.rho ?? (c.v === AIR ? -1 : 1); shapeEdited[i] = c.edited ? 1 : 0;
  }
  return { nx: n, ny: n, nz: n, apron: A, blocks, rho, shapeEdited };
}
function keyed(m) {
  const u = new Uint8Array(m.vertexData);
  const map = new Map();
  for (let v = 0; v < m.vertexCount; v++) {
    const k = `${m.corners[v * 3]},${m.corners[v * 3 + 1]},${m.corners[v * 3 + 2]},${u[v * 16 + 12]},${u[v * 16 + 7] & 1}`;
    const rec = Array.from(u.subarray(v * 16, v * 16 + 12)).join(',');
    map.set(k, (map.get(k) ?? '') + '|' + rec);
  }
  return map;
}
for (const vn of vs.split(',')) {
  const V = VARIANTS[vn];
  seed = 12345;
  let worstLo = 0, worstHi = 0, worstPosLo = 0, worstPosHi = 0;
  const m0 = keyed(V.mesh({ ...region(base), params: V.params }));
  for (let t = 0; t < TRIALS; t++) {
    // edit somewhere on the surface near the built quarter
    const bx = 6 + Math.floor(rnd() * 20), bz = 6 + Math.floor(rnd() * 20);
    let by = 0;
    for (let y = 30; y > 0; y--) if (base(bx, y, bz).v !== AIR) { by = y; break; }
    const place = rnd() < 0.5;
    const ey = place ? by + 1 : by;
    const fn = (x, y, z) => (x === bx && y === ey && z === bz ? (place ? { v: PLANKS, edited: true } : { v: AIR, edited: true }) : base(x, y, z));
    const m1 = keyed(V.mesh({ ...region(fn), params: V.params }));
    for (const [k, rec] of m1) {
      const r0 = m0.get(k);
      if (r0 === rec) continue;
      const [cx, cy, cz] = k.split(',').map(Number);
      // corner range of block b is [b, b+1]; distance below b and above b+1
      const lo = Math.max(bx - cx, ey - cy, bz - cz), hi = Math.max(cx - bx, cy - ey, cz - bz);
      if (lo > worstLo) worstLo = lo;
      if (hi > worstHi) worstHi = hi;
      // position-only change?
      if (r0 !== undefined) {
        const a = r0.split('|').filter(Boolean)[0].split(',').slice(0, 6).join(','), b = rec.split('|').filter(Boolean)[0].split(',').slice(0, 6).join(',');
        if (a !== b) { if (lo > worstPosLo) worstPosLo = lo; if (hi > worstPosHi) worstPosHi = hi; }
      }
    }
    for (const k of m0.keys()) if (!m1.has(k)) { const [cx, cy, cz] = k.split(',').map(Number); const lo = Math.max(bx - cx, ey - cy, bz - cz), hi = Math.max(cx - bx, cy - ey, cz - bz); if (lo > worstLo) worstLo = lo; if (hi > worstHi) worstHi = hi; }
  }
  console.log(`${vn.padEnd(7)} ${TRIALS} single edits: farthest changed vertex (any byte) b−${worstLo} … b+${worstHi}; position bytes b−${worstPosLo} … b+${worstPosHi}   (dirty set covers b−9 … b+10)`);
}
