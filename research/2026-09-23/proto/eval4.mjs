import { meshChunk, worldPos } from './sn.mjs';
const deg = r => r * 180 / Math.PI;
function qn(m, q) { const p = q.v.map(v => worldPos(m, v));
  const d1 = [0,1,2].map(i => p[2][i] - p[0][i]), d2 = [0,1,2].map(i => p[3][i] - p[1][i]);
  const n = [d1[1]*d2[2]-d1[2]*d2[1], d1[2]*d2[0]-d1[0]*d2[2], d1[0]*d2[1]-d1[1]*d2[0]]; const a = Math.hypot(...n);
  return { n: n.map(x => x / a), area: a / 2, c: [0,1,2].map(i => (p[0][i]+p[1][i]+p[2][i]+p[3][i]) / 4) }; }
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
for (const [name, base] of [['k6 G1 binary', { k: 6, guard: G1 }], ['k6 G1 hint, hinted lambda 0', { k: 6, guard: G1, useHint: true, hintedLambda: 0 }], ['k6 G1 hint, hinted lambda .1', { k: 6, guard: G1, useHint: true, hintedLambda: 0.1 }], ['k6 G1 + generator hint', { k: 6, guard: G1, useHint: true }], ['k2 G1 + generator hint', { k: 2, guard: G1, useHint: true }]]) {
  const out = [];
  for (const n of [2, 4, 8, 16]) {
    // continuous plane density f = x/n - z - 0.5 (block centres at +0.5); occupancy = f > 0 at block centre
    const f = (x, y, z) => (x + 0.5) / n - (z + 0.5);
    const occ = (x, y, z) => (f(x, y, z) > 0 ? 1 : 0);
    const m = meshChunk(occ, -16, -16, -12, 32, { ...base, hint: base.useHint ? f : null });
    const id = [-1/n, 0, 1].map(x => x / Math.hypot(1/n, 1)); let s2 = 0, sa = 0, mx = 0;
    for (const q of m.quads) { const { n: nn, area, c } = qn(m, q); if (Math.abs(c[0]) > 12 || Math.abs(c[1]) > 12) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, nn[0]*id[0]+nn[1]*id[1]+nn[2]*id[2]))); s2 += area*a*a; sa += area; mx = Math.max(mx, a); }
    out.push(`1:${n} ${deg(Math.sqrt(s2/sa)).toFixed(1)}/${deg(mx).toFixed(0)}°`);
  }
  const R = 7, fs = (x, y, z) => R - Math.hypot(x + .5, y + .5, z + .5);
  let m = meshChunk((x, y, z) => (fs(x, y, z) > 0 ? 1 : 0), -10, -10, -10, 20, { ...base, hint: base.useHint ? fs : null });
  let s2 = 0, sa = 0; for (const q of m.quads) { const { n: nn, area, c } = qn(m, q); const rr = Math.hypot(...c);
    const a = Math.acos(Math.max(-1, Math.min(1, (nn[0]*c[0]+nn[1]*c[1]+nn[2]*c[2]) / rr))); s2 += area*a*a; sa += area; }
  out.push(`sphere ${deg(Math.sqrt(s2/sa)).toFixed(1)}°`);
  // single edited block on a hinted 1:4 slope: height of bump above the slope
  const f4 = (x, y, z) => (x + 0.5) / 4 - (z + 0.5);
  const top = x => Math.ceil((x + 0.5) / 4 - 0.5); // first air z in column x
  const occB = (x, y, z) => (f4(x, y, z) > 0 || (x === 0 && y === 0 && z === top(0)) ? 1 : 0);
  const hintB = (x, y, z) => (x === 0 && y === 0 && z === top(0) ? null : f4(x, y, z));
  m = meshChunk(occB, -8, -8, -8, 16, { ...base, hint: base.useHint ? hintB : null });
  const m0 = meshChunk((x, y, z) => (f4(x, y, z) > 0 ? 1 : 0), -8, -8, -8, 16, { ...base, hint: base.useHint ? f4 : null });
  const hmax = mm => { let best = new Map(); for (let v = 0; v < mm.V; v++) { const p = worldPos(mm, v); if (Math.abs(p[0]) < 3 && Math.abs(p[1]) < 3) { const k = (mm.cx[v]+mm.bx0) + ',' + (mm.cy[v]+mm.by0); best.set(k, Math.max(best.get(k) ?? -1e9, p[2])); } } return best; };
  const a = hmax(m), b = hmax(m0); let d = 0; for (const [k, z] of a) d = Math.max(d, z - (b.get(k) ?? z));
  out.push(`edit-bump on 1:4 slope +${d.toFixed(2)}`);
  console.log(name.padEnd(26), out.join(' | '));
}
