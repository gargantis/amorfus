import { meshChunk, worldPos, volume, watertight } from './sn.mjs';
const f = (x, d = 2) => x.toFixed(d);
const deg = r => r * 180 / Math.PI;
function vAt(m, x, y, z) { for (let v = 0; v < m.V; v++) if (m.cx[v] + m.bx0 === x && m.cy[v] + m.by0 === y && m.cz[v] + m.bz0 === z) return worldPos(m, v); return null; }
function qn(m, q) {
  const p = q.v.map(v => worldPos(m, v));
  const d1 = [0,1,2].map(i => p[2][i] - p[0][i]), d2 = [0,1,2].map(i => p[3][i] - p[1][i]);
  const n = [d1[1]*d2[2]-d1[2]*d2[1], d1[2]*d2[0]-d1[0]*d2[2], d1[0]*d2[1]-d1[1]*d2[0]];
  const a = Math.hypot(...n); return { n: n.map(x => x / a), area: a / 2, c: [0,1,2].map(i => (p[0][i]+p[1][i]+p[2][i]+p[3][i]) / 4) };
}
const maxZ = m => { let t = -1e9; for (let v = 0; v < m.V; v++) t = Math.max(t, m.W[3*v+2]); return t; };
export function evaluate(va) {
  const r = {};
  const o = { ...va, apron: (va.k ?? 4) + 3 };
  r.bump = maxZ(meshChunk((x,y,z) => (z < 0 || (!x && !y && !z) ? 1 : 0), -6,-6,-6,12,o));
  let m = meshChunk((x,y,z) => (z < 0 && !(!x && !y && z === -1) ? 1 : 0), -6,-6,-6,12,o);
  let bot = 1e9; for (let v = 0; v < m.V; v++) { const z = m.W[3*v+2]; if (z > -1.6) bot = Math.min(bot, z); } r.dent = -bot;
  m = meshChunk((x,y,z) => (!x && !y && !z ? 1 : 0), -6,-6,-6,12,o); r.iso = volume(m); r.wt = watertight(m);
  r.pad = maxZ(meshChunk((x,y,z) => (z < 0 || (x >= 0 && x < 2 && y >= 0 && y < 2 && !z) ? 1 : 0), -6,-6,-6,12,o));
  r.ridge = maxZ(meshChunk((x,y,z) => (z < 0 || (!x && !z) ? 1 : 0), -6,-6,-6,12,o));
  m = meshChunk((x,y,z) => (z < 0 || (!x && !y && z >= 0 && z < 6) ? 1 : 0), -6,-6,-6,12,o);
  r.pillar = vAt(m,1,1,3)[0] - vAt(m,0,0,3)[0];
  m = meshChunk((x,y,z) => (z < 0 || (!x && z >= 0 && z < 5) ? 1 : 0), -6,-6,-6,12,o);
  r.wall = vAt(m,1,0,3)[0] - vAt(m,0,0,3)[0];
  r.slope = {};
  for (const n of [1, 2, 4, 8]) {
    const mm = meshChunk((x,y,z) => (z < Math.floor(x / n) ? 1 : 0), -16,-16,-12,32,o);
    const id = [-1/n, 0, 1].map(x => x / Math.hypot(1/n, 1));
    let s2 = 0, sa = 0, mx = 0;
    for (const q of mm.quads) { const { n: nn, area, c } = qn(mm, q); if (Math.abs(c[0]) > 12 || Math.abs(c[1]) > 12) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, nn[0]*id[0]+nn[1]*id[1]+nn[2]*id[2]))); s2 += area*a*a; sa += area; mx = Math.max(mx, a); }
    r.slope[n] = [deg(Math.sqrt(s2 / sa)), deg(mx)];
  }
  const R = 7; m = meshChunk((x,y,z) => ((x+.5)**2+(y+.5)**2+(z+.5)**2 < R*R ? 1 : 0), -10,-10,-10,20,o);
  let s2 = 0, sa = 0; for (const q of m.quads) { const { n: nn, area, c } = qn(m, q); const rr = Math.hypot(...c);
    const a = Math.acos(Math.max(-1, Math.min(1, (nn[0]*c[0]+nn[1]*c[1]+nn[2]*c[2]) / rr))); s2 += area*a*a; sa += area; }
  r.sphere = deg(Math.sqrt(s2 / sa));
  return r;
}
export function line(name, r) {
  return `${name.padEnd(30)} bump ${f(r.bump)} dent ${f(r.dent)} iso ${f(r.iso)} pad ${f(r.pad)} ridge ${f(r.ridge)} pillar ${f(r.pillar)} wall ${f(r.wall)} | ` +
    [1,2,4,8].map(n => `1:${n} ${r.slope[n][0].toFixed(1)}/${r.slope[n][1].toFixed(0)}°`).join(' ') + ` | sph ${r.sphere.toFixed(1)}° wt${r.wt}`;
}
if (process.argv[1].endsWith('eval.mjs')) {
  const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
  const G2 = [0.15, 0.2, 0.25, 0.4, 0.5, 0.5, 0.5];
  const G3 = [0.2, 0.2, 0.25, 0.5, 0.5, 0.5, 0.5];
  const V = [
    ['cubes', { k: 0 }],
    ['naiveSN centroid k0', { init: 'centroid', k: 0 }],
    ['hyp corner k4', { k: 4 }],
    ['corner k2', { k: 2 }],
    ['corner k3', { k: 3 }],
    ['corner k6', { k: 6 }],
    ['corner k8', { k: 8 }],
    ['centroid k4', { init: 'centroid', k: 4 }],
    ['corner k4 guard G1', { k: 4, guard: G1 }],
    ['corner k6 guard G1', { k: 6, guard: G1 }],
    ['corner k8 guard G1', { k: 8, guard: G1 }],
    ['corner k8 guard G2', { k: 8, guard: G2 }],
    ['corner k8 guard G3', { k: 8, guard: G3 }],
    ['corner k12 guard G1', { k: 12, guard: G1 }],
    ['centroid k4 guard G1', { init: 'centroid', k: 4, guard: G1 }],
    ['centroid k6 guard G1', { init: 'centroid', k: 6, guard: G1 }],
  ];
  for (const [n, va] of V) console.log(line(n, evaluate(va)));
}
