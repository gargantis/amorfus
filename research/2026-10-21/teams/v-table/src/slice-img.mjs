// v-table: cross-section of the physics surface with surface-nets mesh
// slices for several vertex placements.
//   node src/slice-img.mjs <set> <regime> <n> <name> <z|x=..|y=..> <out.png> [placements] [--fit f.json]
// Grey = physics solid (render field D > 0); thin grey lines = block grid;
// coloured polylines = the mesh cut by the plane: cube black, bevel cyan,
// tabNV (team table's no-volume table) orange, onD (on-surface vertices)
// magenta, fit (patch-fitted table) green, tabK8 blue. Dashed box = E.
import { readFileSync } from 'node:fs';
import { savePng } from '../../../lib/render.mjs';
import { sceneSet } from './scenes.mjs';
import { loadCache } from './simcache.mjs';
import { makeField, topology, positions, quadTris } from './meshlib.mjs';
import { placementsFor } from './score.mjs';

const args = process.argv.slice(2);
const [set, regime, nS, name, cut, out] = args;
const want = (args[6] && !args[6].startsWith('--') ? args[6] : 'cube,bevel,tabNV,onD').split(',');
const fi = args.indexOf('--fit');
const extra = { tables: {} };
if (fi > 0) for (const it of args[fi + 1].split(',')) { const [nm, f] = it.includes('=') ? it.split('=') : [null, it]; const j = JSON.parse(readFileSync(f, 'utf8')); extra.tables[nm ?? j.name] = j.entries; }
const COL = { cube: [0, 0, 0], bevel: [0, 170, 200], tabNV: [240, 130, 0], onD: [200, 0, 160], tabK8: [40, 70, 220], hints: [120, 120, 0] };
const colOf = (k) => COL[k] ?? (k.startsWith('fit') ? [0, 160, 40] : [100, 100, 100]);
const sc = sceneSet(set).find((s) => s.name === name);
const c = loadCache(regime, +nS, name);
const fd = makeField(c, 'D');
const topo = topology(sc.get, sc.evalLo.map((v) => v - 2), sc.evalHi.map((v) => v + 2));
const P = placementsFor(sc, set, regime, { D: fd }, topo, extra);
// cut plane: axis a at value v; image axes (u, w) = the other two, w up = y when possible
const [ax, val] = cut.includes('=') ? [{ x: 0, y: 1, z: 2 }[cut[0]], +cut.slice(2)] : [2, +cut];
const [ua, wa] = ax === 0 ? [2, 1] : ax === 1 ? [0, 2] : [0, 1];
const lo = sc.evalLo.map((v) => v - 1.5), hi = sc.evalHi.map((v) => v + 1.5);
const ppb = 48;
const W = Math.round((hi[ua] - lo[ua]) * ppb), H = Math.round((hi[wa] - lo[wa]) * ppb);
const rgb = new Uint8Array(W * H * 3).fill(255);
const toP = (u, w) => [(u - lo[ua]) * ppb, (hi[wa] - w) * ppb];
const set3 = (u, w) => { const p = [0, 0, 0]; p[ua] = u; p[wa] = w; p[ax] = val; return p; };
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const u = lo[ua] + (i + 0.5) / ppb, w = hi[wa] - (j + 0.5) / ppb;
  const p = set3(u, w);
  const d = fd.sample(p[0], p[1], p[2]);
  const k = 3 * (j * W + i);
  if (d > 0) { rgb[k] = 200; rgb[k + 1] = 200; rgb[k + 2] = 200; }
  const onGrid = Math.abs(u - Math.round(u)) * ppb < 0.5 || Math.abs(w - Math.round(w)) * ppb < 0.5;
  if (onGrid) { rgb[k] = Math.max(0, rgb[k] - 40); rgb[k + 1] = Math.max(0, rgb[k + 1] - 40); rgb[k + 2] = Math.max(0, rgb[k + 2] - 40); }
}
const plot = (x, y, col, r = 1) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const xi = Math.round(x + dx), yi = Math.round(y + dy);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
    const k = 3 * (yi * W + xi); rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2];
  }
};
const line = (a, b, col, r) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1; for (let t = 0; t <= n; t++) plot(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n, col, r); };
// E box dashed
{
  const e0 = toP(sc.evalLo[ua], sc.evalLo[wa]), e1 = toP(sc.evalHi[ua], sc.evalHi[wa]);
  const dash = (a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let t = 0; t <= n; t++) if ((t >> 3) % 2 === 0) plot(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n, [90, 90, 90], 0); };
  dash(e0, [e1[0], e0[1]]); dash([e1[0], e0[1]], e1); dash(e1, [e0[0], e1[1]]); dash([e0[0], e1[1]], e0);
}
for (const pk of want) {
  const off = P[pk];
  if (!off) { console.log('no placement', pk); continue; }
  const pos = positions(topo, off);
  for (const q of topo.quads) for (const t of quadTris(q, pos)) {
    const s = t.map((p) => p[ax] - val);
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3], sa = s[e], sb = s[(e + 1) % 3];
      if ((sa > 0) !== (sb > 0)) { const f = sa / (sa - sb); pts.push(toP(a[ua] + f * (b[ua] - a[ua]), a[wa] + f * (b[wa] - a[wa]))); }
    }
    if (pts.length === 2) line(pts[0], pts[1], colOf(pk), pk === 'cube' ? 0 : 1);
  }
}
savePng(out, { width: W, height: H, rgb });
console.log(out, W, H);
