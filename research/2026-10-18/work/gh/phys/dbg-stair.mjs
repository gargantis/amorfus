import { VARIANTS } from '../variants.mjs';
import { MeshWorld } from './battery.mjs';
import { stepPlayer } from './controller-repo.mjs';
const name = process.argv[2] ?? 'gh-cc8';
const n = Number(process.argv[3] ?? 1);
const fn = (x, y) => { if (y < 8) return { v: 3 }; const h = x < 6 ? 0 : Math.min(12, Math.floor((x - 6) / n) + 1); return y < 8 + h ? { v: 3, edited: true } : { v: 0 }; };
const w = new MeshWorld(fn, VARIANTS[name].raw, 10).build(-1, 0, -1, 1, 0, 1);
const ch = w.chunkAt(0, 0, 0);
const P = ch.positions, I = ch.indexData;
// triangles with all vertices in x∈[4,9], y∈[7.5,11], z∈[8,9.5]
for (let t = 0; t < I.length / 3; t++) {
  const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  if (!v.every((p) => p[0] >= 4 && p[0] <= 9 && p[1] >= 7.5 && p[1] <= 11 && p[2] >= 8 && p[2] <= 9.01)) continue;
  const u = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], w2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
  const N = [u[1] * w2[2] - u[2] * w2[1], u[2] * w2[0] - u[0] * w2[2], u[0] * w2[1] - u[1] * w2[0]];
  const l = Math.hypot(...N);
  const ang = Math.acos(N[1] / l) * 180 / Math.PI;
  console.log(v.map((p) => `(${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(2)})`).join(' '), `slope ${ang.toFixed(1)}°`);
}
let s = { position: [3.5, 8.1, 8.5], velocity: [0, 0, 0], onGround: false, flying: false };
for (let i = 0; i < 240; i++) { s = stepPlayer(w, s, { move: [0, 1], yaw: -Math.PI / 2, jump: false, sprint: false, descend: false, toggleFly: false }, 1 / 60); if (i % 10 === 0) console.log(i, s.position.map((v) => v.toFixed(3)).join(','), s.onGround); }
