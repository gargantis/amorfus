// E5c: for vertex-rule corners left off their D = 0 surface (line40 and
// newton4), the distance from the returned vertex to the nearest D = 0 point
// in the clamp box (21^3 sign-change search), and the solid-count/material
// class. Also the same corners' masks (bit j = ox | oz<<1 | oy<<2).
//   node e5c-disp.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { bspline } from '../../fast/src/kern.mjs';
import { buildGenMeshInput } from '../../fast/src/repo-bundle.mjs';
import { L20, rules, bubbleVertices, r4 } from './common.mjs';
const [out] = process.argv.slice(2);
const K1 = bspline(0.2, 1);
const LT = []; for (let n = 0; n <= 27; n++) { const t = (27 - n) / 26; LT.push(L20.a + L20.b * t ** L20.p); }
function fieldOf(reg, NX, NZ, x, y, z) {
  const SY = NX * NZ, SZ = NX, at = (i, j, k) => reg[j * SY + k * SZ + i] & 0xff;
  const bl = []; let mask = 0, bit = 0; const mats = new Set();
  for (let dy = -1; dy <= 0; dy++) for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++, bit++) {
    const m = at(x + dx, y + dy, z + dz); if (!m) continue; mask |= 1 << bit; mats.add(m);
    let c = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) if (at(x + dx + a, y + dy + b, z + dz + e) === m) c++;
    bl.push({ c: [dx + 0.5, dy + 0.5, dz + 0.5], m, lam: LT[c] });
  }
  const f = (s) => { let Sa = 0; const S = new Map(), L = new Map(); for (const b of bl) { const w = K1.k(s[0] - b.c[0]) * K1.k(s[1] - b.c[1]) * K1.k(s[2] - b.c[2]); Sa += w; S.set(b.m, (S.get(b.m) ?? 0) + w); L.set(b.m, (L.get(b.m) ?? 0) + b.lam * w); } let best = -Infinity; for (const [m, v] of S) if (v > 1e-9) best = Math.max(best, v + L.get(m) / v); return Sa + (best === -Infinity ? 0 : best) - 1; };
  return { f, mask, solid: bl.length, nmat: mats.size };
}
const G = 21, pts = []; for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) for (let e = 0; e < G; e++) pts.push([-0.48 + 0.96 * a / (G - 1), -0.48 + 0.96 * b / (G - 1), -0.48 + 0.96 * e / (G - 1)]);
function nearestZero(f, s) {
  // nearest point whose sign differs from f(s), refined by bisection along the segment
  const s0 = f(s) > 0; let best = Infinity, bp = null;
  for (const p of pts) { if ((f(p) > 0) === s0) continue; const d = Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2]); if (d < best) { best = d; bp = p; } }
  if (!bp) return null;
  let a = 0, b = 1; for (let i = 0; i < 30; i++) { const m = 0.5 * (a + b); const q = s.map((v, t) => v + (bp[t] - v) * m); if ((f(q) > 0) === s0) a = m; else b = m; }
  return best * 0.5 * (a + b);
}
const grad = (f, s, e = 1e-4) => [0, 1, 2].map((t) => { const a = s.slice(), b = s.slice(); a[t] += e; b[t] -= e; return (f(a) - f(b)) / (2 * e); });
const CH = [[0, 0, 0], [1, 0, 0], [-2, 1, 1], [-2, -1, 1], [-2, -1, 0], [-2, 0, 1]];
const res = {};
for (const id of ['bub-b1-line40', 'bub-b1-newton4']) {
  const rule = rules[id](); const disp = []; const byMask = {}; let total = 0; const byClass = {};
  for (const c of CH) {
    const { input } = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map());
    const o = bubbleVertices(input.blocks, input.nx, input.ny, input.nz, input.apron, rule);
    for (let v = 0; v < o.count; v++) {
      total++;
      const x = o.corner[v * 3], y = o.corner[v * 3 + 1], z = o.corner[v * 3 + 2], s = [o.off[v * 3], o.off[v * 3 + 1], o.off[v * 3 + 2]];
      const I = fieldOf(input.blocks, input.nx, input.nz, x, y, z);
      const D = I.f(s), g = Math.hypot(...grad(I.f, s));
      if ((g > 1e-6 ? Math.abs(D) / g : 1) <= 0.02) continue;
      const d = nearestZero(I.f, s) ?? 1;
      disp.push(d);
      byMask[I.mask] = (byMask[I.mask] ?? 0) + 1;
      const k = `${I.solid}s-${I.nmat}m`; byClass[k] = byClass[k] ?? []; byClass[k].push(d);
    }
  }
  const s = disp.slice().sort((a, b) => a - b), q = (p) => r4(s[Math.min(s.length - 1, Math.floor(p * s.length))]);
  res[id] = { totalCorners: total, offCorners: disp.length, dispToNearestSurface: { p50: q(0.5), p90: q(0.9), max: r4(s[s.length - 1]), over0_1: s.filter((v) => v > 0.1).length, over0_25: s.filter((v) => v > 0.25).length },
    byClass: Object.fromEntries(Object.entries(byClass).map(([k, a]) => [k, { n: a.length, meanDisp: r4(a.reduce((x, y) => x + y, 0) / a.length), maxDisp: r4(Math.max(...a)) }])),
    topMasks: Object.entries(byMask).sort((a, b) => b[1] - a[1]).slice(0, 8) };
  console.log(id, JSON.stringify(res[id]));
}
writeFileSync(out, JSON.stringify(res, null, 1));
