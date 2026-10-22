// Microbenchmark: the engine's separable Gaussian blur (lib/mbo.mjs blur3,
// truncated at 3s) against a separable tent kernel (box * box, two running
// sums per axis) of the same variance. Both kernels satisfy G >= 0 and
// Fourier transform >= 0 (Esedoglu & Otto 2015, condition (49)); the tent is
// anisotropic. Grid 96^3 (885k cells), s = 3.2 sub-cells (n = 16, s = 0.2).
// Writes results-blurbench.json.
import { writeFileSync } from 'node:fs';
import { blur3, gaussKernel } from '../../lib/mbo.mjs';

const W = 96, H = 96, Dd = 96, N = W * H * Dd;
const s = 3.2;
function fill(a) { // a blocky indicator: half-space plus some cubes
  for (let k = 0; k < Dd; k++) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    a[(k * H + j) * W + i] = (j < 40 || ((i >> 4) + (k >> 4)) % 2 === 0 && j < 56) ? 1 : 0;
  }
}
// box of odd width b along one axis via running sums, in place
function boxAxis(arr, w, h, d, axis, b, line, tmp) {
  const len = axis === 0 ? w : axis === 1 ? h : d;
  const stride = axis === 0 ? 1 : axis === 1 ? w : w * h;
  const nA = axis === 0 ? h : w, nB = axis === 2 ? h : d;
  const r = (b - 1) >> 1, inv = 1 / b;
  for (let bb = 0; bb < nB; bb++) for (let a = 0; a < nA; a++) {
    const s0 = axis === 0 ? (bb * h + a) * w : axis === 1 ? bb * w * h + a : bb * w + a;
    for (let i = 0; i < len; i++) line[i] = arr[s0 + i * stride];
    let acc = 0;
    for (let i = 0; i <= r && i < len; i++) acc += line[i];
    for (let i = 0; i < len; i++) {
      tmp[i] = acc * inv; // zero outside the grid (same convention as a truncated blur at the edge, not renormalised)
      const add = i + r + 1, sub = i - r;
      if (add < len) acc += line[add];
      if (sub >= 0) acc -= line[sub];
    }
    for (let i = 0; i < len; i++) arr[s0 + i * stride] = tmp[i];
  }
}
function tent3(arr, w, h, d, b) {
  const L = Math.max(w, h, d), line = new Float64Array(L), tmp = new Float64Array(L);
  for (const axis of [0, 1, 2]) { boxAxis(arr, w, h, d, axis, b, line, tmp); boxAxis(arr, w, h, d, axis, b, line, tmp); }
}
// box width b with tent variance 2 (b^2 - 1) / 12 closest to s^2
let b = 1; while (2 * ((b + 2) ** 2 - 1) / 12 <= s * s) b += 2;
if (Math.abs(2 * ((b + 2) ** 2 - 1) / 12 - s * s) < Math.abs(2 * (b * b - 1) / 12 - s * s)) b += 2;
const a = new Float64Array(N);
const ker = gaussKernel(s);
const time = (f) => { fill(a); const t0 = performance.now(); f(); return performance.now() - t0; };
const g = [], t = [];
for (let rep = 0; rep < 5; rep++) { g.push(time(() => blur3(a, W, H, Dd, ker))); t.push(time(() => tent3(a, W, H, Dd, b))); }
const med = (x) => x.slice().sort((p, q) => p - q)[2];
const res = { grid: [W, H, Dd], cells: N, s, gaussTaps: 2 * ker.R + 1, tentBoxWidth: b, tentVariance: +(2 * (b * b - 1) / 12).toFixed(3), gaussVariance: s * s,
  gaussMsMedian: +med(g).toFixed(1), tentMsMedian: +med(t).toFixed(1), speedup: +(med(g) / med(t)).toFixed(2), gaussMs: g.map((x) => +x.toFixed(1)), tentMs: t.map((x) => +x.toFixed(1)),
  note: 'blur only; the engine also spends time in the volume solve and assignment; node ' + process.version };
writeFileSync(new URL('./results-blurbench.json', import.meta.url), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
