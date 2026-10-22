// Images: a cross-section of the full simulation (lib/render.mjs
// renderSlice, axis z at a lattice plane) with the mesh cross-sections of
// four vertex rules drawn on top: the reference vertex measured on the sim
// (white), the E2c class table with the volume constraint (red), the E2c
// class table without it (orange), the repo's bevel rule (cyan).
// Mesh edges drawn: a lattice edge in the plane is joined when the surface
// crosses the plane there, i.e. the faces on both sides of the plane that
// contain the edge are both solid/air pairs (in-plane quads are left out).
//   node src/overlay.mjs <set> <regime> <n> <scene> <z> [tag]
import { readFileSync, mkdirSync } from 'node:fs';
import { simulateScene, measureCorner, bevelVertex, REGIMES } from './sim.mjs';
import { buildClassTable, classOf, symPointInv } from './lattice.mjs';
import { renderSlice, savePng } from '../../../lib/render.mjs';
import { sceneByName } from './scene.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const [set, regName, nStr, name, zStr, tag = ''] = process.argv.slice(2);
const n = +nStr, Z = +zStr;
const T = buildClassTable();
const tab = JSON.parse(readFileSync(`${ROOT}res/table/${regName}_E2c_n12_clu.json`, 'utf8')).entries;
const tabNov = JSON.parse(readFileSync(`${ROOT}res/table/${regName}_E2c_n12_clu-novol.json`, 'utf8')).entries;
const sc = sceneByName(set, name);
const opts = { ...REGIMES[regName], n, ...(sc.clamp ? { margin: 0, bbox: sc.bbox } : { margin: 1 }) };
const sim = simulateScene(sc.blocks, opts, sc.group);
const ppb = 48;
const img = renderSlice(sim, { axis: 2, at: Z, ppb, grid: true });
const lo = [sim.ox, sim.oy, sim.oz], ext = [sim.NX / n, sim.NY / n, sim.NZ / n];
const toPix = (x, y) => [Math.round((x - lo[0]) * ppb - 0.5), Math.round((lo[1] + ext[1] - y) * ppb - 0.5)];
const put = (i, j, col) => { if (i < 0 || j < 0 || i >= img.width || j >= img.height) return; const k = (j * img.width + i) * 3; img.rgb[k] = col[0]; img.rgb[k + 1] = col[1]; img.rgb[k + 2] = col[2]; };
const line = (a, b, col) => { const [x0, y0] = toPix(a[0], a[1]), [x1, y1] = toPix(b[0], b[1]); const N = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let s = 0; s <= N; s++) { const i = Math.round(x0 + (x1 - x0) * s / N), j = Math.round(y0 + (y1 - y0) * s / N); put(i, j, col); put(i, j + 1, col); } };
const dot = (a, col, r = 2) => { const [i, j] = toPix(a[0], a[1]); for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) put(i + di, j + dj, col); };
const lab = (x, y, z) => { const l = []; for (let b = 0; b < 8; b++) l.push(sc.get(x - 1 + (b & 1), y - 1 + ((b >> 2) & 1), z - 1 + ((b >> 1) & 1))); return l; };
const x0 = Math.ceil(lo[0]), x1 = Math.floor(lo[0] + ext[0]), y0 = Math.ceil(lo[1]), y1 = Math.floor(lo[1] + ext[1]);
const V = new Map();
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
  const l8 = lab(x, y, Z);
  if (!l8.some((v) => v) || l8.every((v) => v)) continue;
  if (sc.clamp && (x < sc.evalLo[0] || x > sc.evalHi[0] || y < sc.evalLo[1] || y > sc.evalHi[1])) continue;
  const m = measureCorner(sim, [x, y, Z], l8);
  const { cls, g } = classOf(T, l8);
  const e = tab[cls];
  const vt = e && e.vsn ? symPointInv(g, e.vseam && e.seamInCell ? e.vseam : e.vsn) : null;
  const en = tabNov[cls];
  const vn = en && en.vsn ? symPointInv(g, en.vseam && en.seamInCell ? en.vseam : en.vsn) : null;
  const ref = m.ok ? ((m.seamInCell ?? 0) > 0 && m.vseam ? m.vseam : m.vsn) : null;
  V.set(`${x},${y}`, { C: [x, y], ref, tab: vt, nov: vn, bev: bevelVertex(l8) });
}
// mesh edges in the plane z = Z: along x between (x,y) and (x+1,y): blocks (x, y-1..y, Z-1..Z)
const surfEdge = (blocks) => blocks.some((v) => v) && !blocks.every((v) => v);
const pos = (rec, key) => (rec[key] ? [rec.C[0] + rec[key][0], rec.C[1] + rec[key][1]] : null);
const RULES = [['bev', [60, 220, 230]], ['tab', [235, 40, 40]], ['nov', [255, 165, 0]], ['ref', [255, 255, 255]]];
for (const [key, col] of RULES) {
  for (const [k, r] of V) {
    const [x, y] = r.C;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const q = V.get(`${x + dx},${y + dy}`);
      if (!q) continue;
      // faces containing the edge on each side of the plane (perpendicular to it)
      const below = dx ? [sc.get(x, y - 1, Z - 1), sc.get(x, y, Z - 1)] : [sc.get(x - 1, y, Z - 1), sc.get(x, y, Z - 1)];
      const above = dx ? [sc.get(x, y - 1, Z), sc.get(x, y, Z)] : [sc.get(x - 1, y, Z), sc.get(x, y, Z)];
      if (!surfEdge(below) || !surfEdge(above)) continue;
      const a = pos(r, key), b = pos(q, key);
      if (a && b) line(a, b, col);
    }
  }
  for (const r of V.values()) { const a = pos(r, key); if (a) dot(a, col, key === 'ref' ? 2 : 1); }
}
const dir = ROOT + 'img/overlay';
mkdirSync(dir, { recursive: true });
const file = `${dir}/${set}-${name}-${regName}-z${Z}${tag}.png`;
savePng(file, img);
console.log(file, img.width, img.height, `${V.size} corners`);
