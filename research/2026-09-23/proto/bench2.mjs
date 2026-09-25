import { mesh, T } from './fast.mjs';
function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const sm = t => t * t * (3 - 2 * t);
function vnoise3(x, y, z) { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); const fx = sm(x - X), fy = sm(y - Y), fz = sm(z - Z);
  let r = 0; for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) r += hash(X + i, Y + j, Z + k) * (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * (k ? fz : 1 - fz); return r; }
const hills = (x, y, z) => { const h = 20 * vnoise3(x / 48, y / 48, 0) + 6 * vnoise3(x / 12, y / 12, 7); return z < h ? 1 : 0; };
const caves = (x, y, z) => (vnoise3(x / 10, y / 10, z / 10) + 0.5 * vnoise3(x / 5, y / 5, z / 5) > 0.75 ? 1 : 0);
const N = 32, REPS = 40, WARM = 10;
for (const shrink of [false, true]) for (const [name, W] of [['hills', hills], ['caves', caves]]) for (const k of [4, 6, 8]) {
  const A = k + 3, S = N + 2 * A;
  const occs = [];
  for (let rep = 0; rep < 8; rep++) { const occ = new Uint8Array(S * S * S); const ox = rep * 32;
    for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) occ[x + S * (y + S * z)] = W(ox + x - A, y - A, z - A); occs.push(occ); }
  const times = []; for (const key in T) T[key] = 0;
  for (let rep = 0; rep < REPS; rep++) { if (rep === WARM) for (const key in T) T[key] = 0;
    const t0 = performance.now(); mesh(occs[rep % 8], S, A, N, k, 0.5, 256, shrink); const t1 = performance.now(); if (rep >= WARM) times.push(t1 - t0); }
  times.sort((a, b) => a - b); const n = REPS - WARM;
  console.log(`${shrink ? 'shrink' : 'full  '} ${name} k=${k}: median ${times[n >> 1].toFixed(2)} ms p90 ${times[(n * 0.9) | 0].toFixed(2)} | phases avg ms: ` + Object.entries(T).map(([a, b]) => `${a} ${(b / n).toFixed(2)}`).join(', '));
}
