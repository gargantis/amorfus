import { mesh } from './fast.mjs';
function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const sm = t => t * t * (3 - 2 * t);
function vnoise3(x, y, z) { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); const fx = sm(x - X), fy = sm(y - Y), fz = sm(z - Z);
  let r = 0; for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) r += hash(X + i, Y + j, Z + k) * (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * (k ? fz : 1 - fz); return r; }
const hills = (x, y, z) => { const h = 20 * vnoise3(x / 48, y / 48, 0) + 6 * vnoise3(x / 12, y / 12, 7); return z < h ? 1 : 0; };
const caves = (x, y, z) => (vnoise3(x / 10, y / 10, z / 10) + 0.5 * vnoise3(x / 5, y / 5, z / 5) > 0.75 ? 1 : 0);
const N = 32;
for (const [name, W] of [['hills', hills], ['caves', caves]]) for (const k of [0, 4, 6, 8]) {
  const A = k + 3, S = N + 2 * A;
  const occ = new Uint8Array(S * S * S);
  let times = [], tris = 0, verts = 0;
  for (let rep = 0; rep < 25; rep++) {
    const ox = rep * 32, oy = 0, oz = 0; // different chunks
    for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) occ[x + S * (y + S * z)] = W(ox + x - A, oy + y - A, oz + z - A);
    const t0 = performance.now();
    const m = mesh(occ, S, A, N, k);
    const t1 = performance.now();
    if (rep >= 5) { times.push(t1 - t0); tris += m.tris; verts += m.verts; }
  }
  times.sort((a, b) => a - b);
  console.log(`${name} k=${k} S=${S}: median ${times[10].toFixed(2)} ms, min ${times[0].toFixed(2)} max ${times[19].toFixed(2)}; avg tris ${(tris / 20) | 0}, verts ${(verts / 20) | 0}, bytes(pos+nrm f32 + u32 idx) ~${(((verts / 20) * 24 + (tris / 20) * 12) / 1024).toFixed(0)} KB`);
}
