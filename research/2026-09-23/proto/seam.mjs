import { mesh } from './fast.mjs';
function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const sm = t => t * t * (3 - 2 * t);
function vn(x, y, z) { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); const fx = sm(x - X), fy = sm(y - Y), fz = sm(z - Z);
  let r = 0; for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) r += hash(X + i, Y + j, Z + k) * (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * (k ? fz : 1 - fz); return r; }
const W = (x, y, z) => { const c = vn(x / 10, y / 10, z / 10) + 0.5 * vn(x / 5, y / 5, z / 5) > 0.75; const sharp = hash(x >> 3, y >> 3, z >> 3) > 0.9; return c ? (sharp ? 2 : 1) : 0; };
const N = 32;
function run(ox, oy, oz, k, A, opts) {
  const S = N + 2 * A, occ = new Uint8Array(S * S * S);
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) occ[x + S * (y + S * z)] = W(ox + x - A, oy + y - A, oz + z - A);
  const m = mesh(occ, S, A, N, k, 0.5, opts.quant, true, opts.offset);
  // map world corner key -> [pos world f32 (as local+origin in f32 GPU-like), normal]
  const map = new Map();
  for (let v = 0; v < m.verts; v++) {
    const p = m.pos.subarray(6 * v, 6 * v + 6);
    // world = f32(origin - A) + f32 local, emulating a GPU model-matrix add in f32
    const wx = Math.fround(Math.fround(ox - A) + p[0]), wy = Math.fround(Math.fround(oy - A) + p[1]), wz = Math.fround(Math.fround(oz - A) + p[2]);
    const c = m.vcorner[v], S2 = S * S; const key = `${ox - A + c % S},${oy - A + ((c / S) | 0) % S},${oz - A + ((c / S2) | 0)}`;
    map.set(key, [wx, wy, wz, p[3], p[4], p[5]]);
  }
  return map;
}
for (const [label, k, A, opts] of [
  ['apron k+3, local-abs f32, quant', 6, 9, { quant: 256, offset: false }],
  ['apron k+3, local-abs f32, no quant', 6, 9, { quant: 0, offset: false }],
  ['apron k+3, offset-space, quant', 6, 9, { quant: 256, offset: true }],
  ['apron k+3, offset-space, no quant', 6, 9, { quant: 0, offset: true }],
  ['apron k+1 (too small), offset, quant', 6, 7, { quant: 256, offset: true }],
]) {
  let shared = 0, posDiff = 0, nrmDiff = 0, maxd = 0;
  for (let t = 0; t < 6; t++) {
    const a = run(t * 64, 0, 0, k, A, opts), b = run(t * 64 + 32, 0, 0, k, A, opts);
    for (const [key, pa] of a) { const pb = b.get(key); if (!pb) continue; if (+key.split(',')[0] !== t * 64 + 32) continue; shared++;
      if (pa[0] !== pb[0] || pa[1] !== pb[1] || pa[2] !== pb[2]) { posDiff++; maxd = Math.max(maxd, Math.abs(pa[0]-pb[0]), Math.abs(pa[1]-pb[1]), Math.abs(pa[2]-pb[2])); }
      if (pa[3] !== pb[3] || pa[4] !== pb[4] || pa[5] !== pb[5]) nrmDiff++; }
  }
  console.log(`${label.padEnd(40)} shared ${shared} posMismatch ${posDiff} (max ${maxd.toExponential(2)}) nrmMismatch ${nrmDiff}`);
}
