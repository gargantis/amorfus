// E5b: which corners does the vertex rule leave off its own D = 0 surface?
// For every mixed corner of generated chunks: does the b1 field D change
// sign anywhere in the clamp box [-0.48, 0.48]^3 (11^3 samples)? Class of
// the corner (solid count, materials). Off-surface = |D|/|grad D| > 0.02 at
// the returned vertex (line solver, 40 bisections).
//   node e5b-bad.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { bspline } from '../../fast/src/kern.mjs';
import { buildGenMeshInput } from '../../fast/src/repo-bundle.mjs';
import { L20, rules, bubbleVertices, r4 } from './common.mjs';

const [out] = process.argv.slice(2);
const K1 = bspline(0.2, 1);
const LT = []; for (let n = 0; n <= 27; n++) { const t = (27 - n) / 26; LT.push(L20.a + L20.b * t ** L20.p); }
function cornerInfo(reg, NX, NZ, x, y, z) {
  const SY = NX * NZ, SZ = NX;
  const at = (i, j, k) => reg[j * SY + k * SZ + i] & 0xff;
  const bl = []; const mats = new Set(); let mask = 0, bit = 0;
  for (let dy = -1; dy <= 0; dy++) for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++, bit++) {
    const m = at(x + dx, y + dy, z + dz);
    if (!m) continue;
    mask |= 1 << bit; mats.add(m);
    let c = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) if (at(x + dx + a, y + dy + b, z + dz + e) === m) c++;
    bl.push({ c: [dx + 0.5, dy + 0.5, dz + 0.5], m, lam: LT[c] });
  }
  const f = (s) => {
    let Sa = 0; const S = new Map(), L = new Map();
    for (const b of bl) { const w = K1.k(s[0] - b.c[0]) * K1.k(s[1] - b.c[1]) * K1.k(s[2] - b.c[2]); Sa += w; S.set(b.m, (S.get(b.m) ?? 0) + w); L.set(b.m, (L.get(b.m) ?? 0) + b.lam * w); }
    let best = -Infinity; for (const [m, v] of S) if (v > 1e-9) best = Math.max(best, v + L.get(m) / v);
    return Sa + (best === -Infinity ? 0 : best) - 1;
  };
  return { f, solid: bl.length, nmat: mats.size, mask };
}
const grad = (f, s, e = 1e-4) => [0, 1, 2].map((t) => { const a = s.slice(), b = s.slice(); a[t] += e; b[t] -= e; return (f(a) - f(b)) / (2 * e); });
const CH = [[0, 0, 0], [1, 0, 0], [-2, 1, 1], [-2, -1, 1], [-2, -1, 0], [-2, 0, 1]];
const rule = rules['bub-b1-line40']();
const cls = {}; let total = 0, off = 0, noCross = 0, offNoCross = 0, offWithCross = 0, singleMatOff = 0;
const examples = [];
for (const c of CH) {
  const { input } = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map());
  const o = bubbleVertices(input.blocks, input.nx, input.ny, input.nz, input.apron, rule);
  for (let v = 0; v < o.count; v++) {
    const x = o.corner[v * 3], y = o.corner[v * 3 + 1], z = o.corner[v * 3 + 2];
    const s = [o.off[v * 3], o.off[v * 3 + 1], o.off[v * 3 + 2]];
    const I = cornerInfo(input.blocks, input.nx, input.nz, x, y, z);
    let pos = false, neg = false;
    for (let a = 0; a <= 10 && !(pos && neg); a++) for (let b = 0; b <= 10; b++) for (let e = 0; e <= 10; e++) { const d = I.f([-0.48 + 0.096 * a, -0.48 + 0.096 * b, -0.48 + 0.096 * e]); if (d > 0) pos = true; else neg = true; }
    const cross = pos && neg;
    const D = I.f(s), g = Math.hypot(...grad(I.f, s));
    const isOff = (g > 1e-6 ? Math.abs(D) / g : 1) > 0.02;
    total++;
    const k = `${I.solid}s-${I.nmat}m`;
    cls[k] = cls[k] ?? { corners: 0, off: 0, noCross: 0 };
    cls[k].corners++;
    if (!cross) { noCross++; cls[k].noCross++; }
    if (isOff) { off++; cls[k].off++; if (cross) offWithCross++; else offNoCross++; if (I.nmat === 1) singleMatOff++; if (examples.length < 12 && (examples.length < 6 || cross)) examples.push({ chunk: c, corner: [x, y, z], solid: I.solid, nmat: I.nmat, mask: I.mask, s, D: r4(D), signChangeInBox: cross }); }
  }
}
const res = { total, offSurface: off, offSurfaceShare: r4(off / total), noSignChangeInBox: noCross, offWithNoCrossing: offNoCross, offDespiteCrossing: offWithCross, offSingleMaterial: singleMatOff,
  classes: Object.fromEntries(Object.entries(cls).sort((a, b) => b[1].off - a[1].off)), examples };
console.log(JSON.stringify({ ...res, classes: undefined, examples: undefined }));
console.log(JSON.stringify(res.classes));
console.log(JSON.stringify(examples.slice(0, 8)));
writeFileSync(out, JSON.stringify(res, null, 1));
