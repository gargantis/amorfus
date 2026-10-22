// E10: picture of the b1 vertex rule's mesh on a generated terrain window,
// (a) cube corners (offset 0), (b) the rule as built (line solver, 40
// bisections), (c) the same with off-surface corners moved to the nearest
// D = 0 point of their own field (what the rule intends). Off-surface
// corners are tinted magenta in (b). Simple z-buffer rasteriser.
//   node e10-meshimg.mjs <imgDir> <out.json>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writePng } from '../../../lib/png.mjs';
import { PALETTE } from '../../../lib/render.mjs';
import { bspline } from '../../fast/src/kern.mjs';
import { buildGenMeshInput } from '../../fast/src/repo-bundle.mjs';
import { L20, rules, bubbleVertices } from './common.mjs';

const [imgDir, out] = process.argv.slice(2);
mkdirSync(imgDir, { recursive: true });
const chunk = [0, 0, 0];
const { input } = buildGenMeshInput([1, 1], ...chunk, new Map());
const NR = input.nx, SY = NR * NR, SZ = NR;
const mat = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= NR || y >= NR || z >= NR ? 0 : input.blocks[y * SY + z * SZ + x] & 0xff);
const W0 = [23, 13, 0], W1 = [36, 23, 14]; // region-coordinate window of blocks
const o = bubbleVertices(input.blocks, NR, NR, NR, input.apron, rules['bub-b1-line40']());
const offs = new Map();
for (let v = 0; v < o.count; v++) offs.set(`${o.corner[v * 3]},${o.corner[v * 3 + 1]},${o.corner[v * 3 + 2]}`, [o.off[v * 3], o.off[v * 3 + 1], o.off[v * 3 + 2]]);
// own field per corner (same as e5b)
const K1 = bspline(0.2, 1);
const LT = []; for (let n = 0; n <= 27; n++) { const t = (27 - n) / 26; LT.push(L20.a + L20.b * t ** L20.p); }
function fieldOf(x, y, z) {
  const bl = [];
  for (let dy = -1; dy <= 0; dy++) for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
    const m = mat(x + dx, y + dy, z + dz); if (!m) continue;
    let c = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) if (mat(x + dx + a, y + dy + b, z + dz + e) === m) c++;
    bl.push({ c: [dx + 0.5, dy + 0.5, dz + 0.5], m, lam: LT[c] });
  }
  return (s) => { let Sa = 0; const S = new Map(), L = new Map(); for (const b of bl) { const w = K1.k(s[0] - b.c[0]) * K1.k(s[1] - b.c[1]) * K1.k(s[2] - b.c[2]); Sa += w; S.set(b.m, (S.get(b.m) ?? 0) + w); L.set(b.m, (L.get(b.m) ?? 0) + b.lam * w); } let best = -Infinity; for (const [m, v] of S) if (v > 1e-9) best = Math.max(best, v + L.get(m) / v); return Sa + (best === -Infinity ? 0 : best) - 1; };
}
const G = 21, pts = []; for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) for (let e = 0; e < G; e++) pts.push([-0.48 + 0.96 * a / (G - 1), -0.48 + 0.96 * b / (G - 1), -0.48 + 0.96 * e / (G - 1)]);
const grad = (f, s, e = 1e-4) => [0, 1, 2].map((t) => { const a = s.slice(), b = s.slice(); a[t] += e; b[t] -= e; return (f(a) - f(b)) / (2 * e); });
const bad = new Set(), fixed = new Map();
for (const [k, s] of offs) {
  const [x, y, z] = k.split(',').map(Number);
  if (x < W0[0] || y < W0[1] || z < W0[2] || x > W1[0] || y > W1[1] || z > W1[2]) continue;
  const f = fieldOf(x, y, z), D = f(s), g = Math.hypot(...grad(f, s));
  if ((g > 1e-6 ? Math.abs(D) / g : 1) <= 0.02) continue;
  bad.add(k);
  const s0 = D > 0; let best = Infinity, bp = null;
  for (const p of pts) { if ((f(p) > 0) === s0) continue; const d = Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2]); if (d < best) { best = d; bp = p; } }
  if (bp) { let a = 0, b = 1; for (let i = 0; i < 30; i++) { const m = 0.5 * (a + b); const q = s.map((v, t) => v + (bp[t] - v) * m); if ((f(q) > 0) === s0) a = m; else b = m; } fixed.set(k, s.map((v, t) => v + (bp[t] - v) * 0.5 * (a + b))); }
}
// mesh triangles of the window (true faces only), colour = solid block material
function tris(offFn) {
  const T = [];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let x = W0[0]; x < W1[0]; x++) for (let y = W0[1]; y < W1[1]; y++) for (let z = W0[2]; z < W1[2]; z++) {
    const m = mat(x, y, z); if (!m) continue;
    for (const [dx, dy, dz] of dirs) {
      if (mat(x + dx, y + dy, z + dz)) continue;
      const ax = dx ? 0 : dy ? 1 : 2, c0 = [x, y, z]; if (dx + dy + dz > 0) c0[ax] += 1;
      const u = (ax + 1) % 3, v = (ax + 2) % 3;
      const cs = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => { const c = c0.slice(); c[u] += a; c[v] += b; return c; });
      const q = cs.map((c) => { const k = c.join(','); const s = offFn(k); return [c[0] + s[0], c[1] + s[1], c[2] + s[2]]; });
      const hot = cs.some((c) => bad.has(c.join(',')));
      const d2 = (p, r) => (p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2 + (p[2] - r[2]) ** 2;
      const tt = d2(q[0], q[2]) <= d2(q[1], q[3]) ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [[q[0], q[1], q[3]], [q[1], q[2], q[3]]];
      for (const t of tt) T.push({ t, m, hot });
    }
  }
  return T;
}
function render(T, path, tint) {
  const Wd = 520, Ht = 400, rgb = new Uint8Array(Wd * Ht * 3).fill(235), zb = new Float64Array(Wd * Ht).fill(Infinity);
  const ctr = [(W0[0] + W1[0]) / 2, (W0[1] + W1[1]) / 2 - 1, (W0[2] + W1[2]) / 2];
  const eye = [ctr[0] - 13, ctr[1] + 12, ctr[2] - 16];
  const fwd = (() => { const d = ctr.map((v, i) => v - eye[i]); const l = Math.hypot(...d); return d.map((v) => v / l); })();
  const right = (() => { const r = [fwd[2], 0, -fwd[0]]; const l = Math.hypot(...r); return r.map((v) => -v / l); })();
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  const f = 560;
  const proj = (p) => { const d = p.map((v, i) => v - eye[i]); const z = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]; return [Wd / 2 + f * (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / z, Ht / 2 - f * (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / z, z]; };
  const sun = (() => { const l = Math.hypot(0.4, 0.85, -0.35); return [0.4 / l, 0.85 / l, -0.35 / l]; })();
  for (const { t, m, hot } of T) {
    const [a, b, c] = t;
    const e1 = b.map((v, i) => v - a[i]), e2 = c.map((v, i) => v - a[i]);
    const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(...nrm) || 1;
    const lam = Math.abs(nrm[0] * sun[0] + nrm[1] * sun[1] + nrm[2] * sun[2]) / nl;
    let col = PALETTE[m];
    if (tint && hot) col = [230, 40, 200];
    const shade = 0.35 + 0.65 * lam;
    const P = [a, b, c].map(proj);
    if (P.some((p) => p[2] <= 0.1)) continue;
    const minx = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), maxx = Math.min(Wd - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const miny = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), maxy = Math.min(Ht - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
      const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2];
      const i = y * Wd + x;
      if (z >= zb[i]) continue;
      zb[i] = z;
      rgb[i * 3] = Math.min(255, col[0] * shade); rgb[i * 3 + 1] = Math.min(255, col[1] * shade); rgb[i * 3 + 2] = Math.min(255, col[2] * shade);
    }
  }
  writePng(path, Wd, Ht, rgb);
}
render(tris(() => [0, 0, 0]), join(imgDir, 'chunk000-window-cubes.png'), false);
render(tris((k) => offs.get(k) ?? [0, 0, 0]), join(imgDir, 'chunk000-window-b1line40.png'), false);
render(tris((k) => offs.get(k) ?? [0, 0, 0]), join(imgDir, 'chunk000-window-b1line40-offmarked.png'), true);
render(tris((k) => fixed.get(k) ?? offs.get(k) ?? [0, 0, 0]), join(imgDir, 'chunk000-window-b1-nearestzero.png'), false);
writeFileSync(out, JSON.stringify({ chunk, window: [W0, W1], cornersInWindow: [...offs.keys()].filter((k) => { const [x, y, z] = k.split(',').map(Number); return x >= W0[0] && y >= W0[1] && z >= W0[2] && x <= W1[0] && y <= W1[1] && z <= W1[2]; }).length, offSurfaceInWindow: bad.size }, null, 1));
console.log('window corners off-surface', bad.size);
