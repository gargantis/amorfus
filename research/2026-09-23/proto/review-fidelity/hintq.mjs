// Reviewer check: research measured hinted slopes with float planar hints; plan uses int8 round(127*clamp(d/scale)).
import { meshChunk, worldPos } from '../sn.mjs';
const deg = r => r * 180 / Math.PI;
function qn(m, q) { const p = q.v.map(v => worldPos(m, v));
  const d1 = [0,1,2].map(i => p[2][i] - p[0][i]), d2 = [0,1,2].map(i => p[3][i] - p[1][i]);
  const n = [d1[1]*d2[2]-d1[2]*d2[1], d1[2]*d2[0]-d1[0]*d2[2], d1[0]*d2[1]-d1[1]*d2[0]]; const a = Math.hypot(...n);
  return { n: n.map(x => x / a), area: a / 2, c: [0,1,2].map(i => (p[0][i]+p[1][i]+p[2][i]+p[3][i]) / 4) }; }
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
const base = { k: 6, guard: G1, hintedLambda: 0 };
for (const [label, q] of [['float hint (research)', null], ['int8 hint, scale 1', 1], ['int8 hint, scale 4', 4]]) {
  const out = [];
  for (const n of [0.5, 1, 2, 4, 8, 16]) {
    const f = (x, y, z) => (x + 0.5) / n - (z + 0.5); // d = H - y form (not distance-normalised)
    const hint = q === null ? f : (x, y, z) => Math.round(127 * Math.max(-1, Math.min(1, f(x, y, z) / q))) / 127;
    const occ = (x, y, z) => (f(x, y, z) > 0 ? 1 : 0);
    const m = meshChunk(occ, -16, -16, -12, 32, { ...base, hint });
    const id = [-1/n, 0, 1].map(x => x / Math.hypot(1/n, 1)); let s2 = 0, sa = 0, mx = 0;
    for (const qq of m.quads) { const { n: nn, area, c } = qn(m, qq); if (Math.abs(c[0]) > 12 || Math.abs(c[1]) > 12) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, nn[0]*id[0]+nn[1]*id[1]+nn[2]*id[2]))); s2 += area*a*a; sa += area; mx = Math.max(mx, a); }
    out.push(`${n >= 1 ? '1:' + n : (1/n) + ':1'} ${deg(Math.sqrt(s2/sa)).toFixed(1)}/${deg(mx).toFixed(0)}`);
  }
  console.log(label.padEnd(22), out.join(' | '));
}
