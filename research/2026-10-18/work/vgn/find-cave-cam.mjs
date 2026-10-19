// vgn: find camera spots inside generated caves: air blocks below the
// terrain top with the most clearance, then a target direction where a ray
// hits rock 6–16 blocks away with a wide-open view.
//   node work/vgn/find-cave-cam.mjs <seed> <cx,cy,cz>
import { genBox } from './util.mjs';
const [sd, cs] = process.argv.slice(2);
const seed = sd.split(',').map(Number), c = cs.split(',').map(Number);
const x0 = c[0] * 32 - 16, y0 = c[1] * 32 - 16, z0 = c[2] * 32 - 16, N = 64;
const { blocks } = genBox(seed, x0, y0, z0, N, N + 40, N);
const NY = N + 40;
const solid = (x, y, z) => x < 0 || y < 0 || z < 0 || x >= N || y >= NY || z >= N || (blocks[(y * N + z) * N + x] & 0xff) !== 0;
// sky-covered: solid somewhere above within 40
const covered = (x, y, z) => { for (let yy = y + 1; yy < NY; yy++) if (solid(x, yy, z)) return true; return false; };
const cands = [];
for (let y = 8; y < N - 8; y++) for (let z = 8; z < N - 8; z++) for (let x = 8; x < N - 8; x++) {
  if (solid(x, y, z) || !covered(x, y, z)) continue;
  // clearance: Chebyshev radius of empty cube
  let r = 0;
  outer: for (r = 1; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (solid(x + dx, y + dy, z + dz)) break outer;
  }
  if (r >= 2) cands.push([r, x, y, z]);
}
cands.sort((a, b) => b[0] - a[0]);
const out = [];
for (const [r, x, y, z] of cands.slice(0, 400)) {
  // best ray direction among 26 + some
  let best = null;
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, -0.4, 1], [-1, -0.4, 1], [1, -0.4, -1], [-1, -0.4, -1], [1, -0.3, 0], [-1, -0.3, 0], [0, -0.3, 1], [0, -0.3, -1]]) {
    const l = Math.hypot(dx, dy, dz);
    let t = 0;
    for (t = 0.5; t < 30; t += 0.25) if (solid(Math.floor(x + 0.5 + dx / l * t), Math.floor(y + 0.5 + dy / l * t), Math.floor(z + 0.5 + dz / l * t))) break;
    if (t >= 6 && t <= 20 && (!best || t > best[0])) best = [t, dx, dy, dz];
  }
  if (best) out.push({ r, eye: [x + x0 + 0.5, y + y0 + 0.5, z + z0 + 0.5], dir: best.slice(1), dist: best[0] });
  if (out.length >= 6) break;
}
console.log(JSON.stringify(out, null, 0));
