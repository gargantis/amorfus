import { meshChunk, AMBIG } from './sn.mjs';
function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const sm = t => t * t * (3 - 2 * t);
function vn(x, y, z) { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); const fx = sm(x - X), fy = sm(y - Y), fz = sm(z - Z);
  let r = 0; for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) r += hash(X + i, Y + j, Z + k) * (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * (k ? fz : 1 - fz); return r; }
const hills = (x, y, z) => { const h = 20 * vn(x / 48, y / 48, 0) + 6 * vn(x / 12, y / 12, 7); return z < h ? 1 : 0; };
const caves = (x, y, z) => (vn(x / 10, y / 10, z / 10) + 0.5 * vn(x / 5, y / 5, z / 5) > 0.75 ? 1 : 0);
for (const [n, W] of [['hills', hills], ['caves', caves]]) {
  let amb = 0, tot = 0;
  for (let t = 0; t < 4; t++) {
    const m = meshChunk(W, t * 32, 0, 0, 32, { k: 0, apron: 2, pinAmbiguous: true });
    for (let v = 0; v < m.V; v++) { tot++; if (m.pinned[v]) amb++; }
  }
  console.log(n, 'vertices', tot, 'ambiguous', amb, (100 * amb / tot).toFixed(2) + '%');
}
