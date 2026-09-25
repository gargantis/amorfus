import { meshChunk, worldPos } from './sn.mjs';
const f = (x, d = 1) => x.toFixed(d);
const deg = r => r * 180 / Math.PI;

function quadNormal(m, q) {
  const p = q.v.map(v => worldPos(m, v));
  // diagonal cross product = 2 * vector area of the (possibly non-planar) quad
  const d1 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  const d2 = [p[3][0] - p[1][0], p[3][1] - p[1][1], p[3][2] - p[1][2]];
  const n = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
  const a = Math.hypot(...n);
  const c = [0, 1, 2].map(i => (p[0][i] + p[1][i] + p[2][i] + p[3][i]) / 4);
  return { n: n.map(x => x / a), area: a / 2, c };
}

const variants = [
  { name: 'cubes', init: 'corner', k: 0 },
  { name: 'naiveSN (centroid k0)', init: 'centroid', k: 0 },
  { name: 'hyp corner k4 lap', init: 'corner', k: 4 },
  { name: 'corner k8 lap', init: 'corner', k: 8 },
  { name: 'centroid k2 lap', init: 'centroid', k: 2 },
  { name: 'centroid k4 lap', init: 'centroid', k: 4 },
  { name: 'corner k4 taubin', init: 'corner', k: 4, taubinMu: -0.53 },
  { name: 'corner k8 taubin', init: 'corner', k: 8, taubinMu: -0.53 },
  { name: 'centroid k4 taubin', init: 'centroid', k: 4, taubinMu: -0.53 },
  { name: 'centroid k8 taubin', init: 'centroid', k: 8, taubinMu: -0.53 },
  { name: 'centroid k16 taubin', init: 'centroid', k: 16, taubinMu: -0.53 },
];

for (const va of variants) {
  const out = [];
  for (const n of [1, 2, 4, 8]) {
    const world = (x, y, z) => (z < Math.floor(x / n) ? 1 : 0);
    const N = 32;
    const m = meshChunk(world, -16, -16, -12, N, { ...va });
    const ideal = [-1 / n, 0, 1].map(x => x / Math.hypot(1 / n, 1));
    let s2 = 0, sa = 0, mx = 0;
    for (const q of m.quads) {
      const { n: qn, area, c } = quadNormal(m, q);
      if (Math.abs(c[0]) > 12 || Math.abs(c[1]) > 12) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, qn[0] * ideal[0] + qn[1] * ideal[1] + qn[2] * ideal[2])));
      s2 += area * ang * ang; sa += area; mx = Math.max(mx, ang);
    }
    out.push(`1:${n} rms ${f(deg(Math.sqrt(s2 / sa)))}° max ${f(deg(mx))}°`);
  }
  // voxel sphere R=7
  const R = 7;
  const sph = (x, y, z) => ((x + .5) ** 2 + (y + .5) ** 2 + (z + .5) ** 2 < R * R ? 1 : 0);
  const m = meshChunk(sph, -10, -10, -10, 20, { ...va });
  let s2 = 0, sa = 0, mx = 0, rs = [], ra = 0;
  for (const q of m.quads) {
    const { n: qn, area, c } = quadNormal(m, q);
    const r = Math.hypot(...c); const rad = c.map(x => x / r);
    const ang = Math.acos(Math.max(-1, Math.min(1, qn[0] * rad[0] + qn[1] * rad[1] + qn[2] * rad[2])));
    s2 += area * ang * ang; sa += area; mx = Math.max(mx, ang); rs.push(r);
  }
  const mean = rs.reduce((a, b) => a + b) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length);
  out.push(`sphere7 rms ${f(deg(Math.sqrt(s2 / sa)))}° max ${f(deg(mx))}° r=${f(mean, 2)}±${f(sd, 2)}`);
  console.log(va.name.padEnd(24), out.join(' | '));
}
