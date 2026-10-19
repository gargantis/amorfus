// vgn: close-ups of the largest residual gn-best AO jumps on terrain
// (both sit in enclosed spots; search 26 directions × distances 2.5–8).
import { meshWorld, renderRow } from './world.mjs';
import { genBox } from './util.mjs';
const OUT = new URL('../../out/vgn-terrain/', import.meta.url).pathname;
for (const [name, seed, c, p, n] of [
  ['jump-s7-3,1,3', [7, 7], [3, 1, 3], [21.5, 27.3, 18.2], null],
  ['jump-s1--3,1,0', [1, 1], [-3, 1, 0], [31.6, 16.9, 30.5], null],
]) {
  const w = [c[0] * 32 + p[0], c[1] * 32 + p[1], c[2] * 32 + p[2]];
  const R = 12, N = 2 * R + 1, b0 = w.map((x) => Math.floor(x) - R);
  const { blocks } = genBox(seed, b0[0], b0[1], b0[2], N, N, N);
  const solid = (x, y, z) => { const i = [x, y, z].map((v, k) => Math.floor(v) - b0[k]); return i.some((v) => v < 0 || v >= N) ? false : (blocks[(i[1] * N + i[2]) * N + i[0]] & 0xff) !== 0; };
  let best = null;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    if (!dx && !dy && !dz) continue;
    const l = Math.hypot(dx, dy, dz);
    let t = 0.6;
    for (; t <= 8; t += 0.1) if (solid(w[0] + dx / l * t, w[1] + dy / l * t, w[2] + dz / l * t)) break;
    if (!best || t > best[0]) best = [t, [dx / l, dy / l, dz / l]];
  }
  const dist = Math.min(best[0] - 0.4, 8);
  const eye = w.map((x, i) => x + best[1][i] * dist);
  console.log(name, 'free distance', best[0].toFixed(1), 'eye', eye.map((x) => x.toFixed(1)));
  const W = meshWorld(seed, [c[0] - 1, c[1] - 1, c[2] - 1], [c[0] + 1, c[1] + 1, c[2] + 1]);
  console.log(renderRow(`${OUT}${name}.png`, [W.prod, W.gn], { eye, target: w, fov: 75, width: 420, height: 320 }));
}
