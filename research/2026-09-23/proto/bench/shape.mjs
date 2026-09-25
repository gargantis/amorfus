import { surfaceNetsFast } from './voxel.mjs';
const S = 14, N = S + 2;
function grid(fn) { const d = new Uint16Array(N ** 3); for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fn(x, y, z)) d[(z * N + y) * N + x] = 1; return d; }
function slopes(name, d) {
  const m = surfaceNetsFast(d, S, {}); const P = m.positions, I = m.indices;
  const hist = {};
  let maxY = -1;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz);
    const ang = Math.round(Math.acos(Math.abs(ny) / L) * 180 / Math.PI);
    hist[ang] = (hist[ang] || 0) + 1;
    maxY = Math.max(maxY, P[a + 1], P[b + 1], P[c + 1]);
  }
  console.log(name, 'tri slope histogram (deg from horizontal: count)', JSON.stringify(hist), 'maxVertexY', maxY);
}
const G = 5; // ground: samples y<=G solid
slopes('flat', grid((x, y, z) => y <= G));
slopes('1-block step', grid((x, y, z) => y <= G || (x >= 8 && y <= G + 1)));
slopes('2-block step', grid((x, y, z) => y <= G || (x >= 8 && y <= G + 2)));
slopes('single block on flat', grid((x, y, z) => y <= G || (x === 8 && z === 8 && y === G + 1)));
slopes('1x1 pillar 3 high', grid((x, y, z) => y <= G || (x === 8 && z === 8 && y <= G + 3)));
slopes('1-thick wall 3 high', grid((x, y, z) => y <= G || (x === 8 && y <= G + 3)));
