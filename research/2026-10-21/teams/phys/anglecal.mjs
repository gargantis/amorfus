// Calibrates the label-based junction-angle measurement (labtools.anglesAt):
// the exact 2D solver result (120 degrees by construction) is rasterised onto
// engine grids of several n and measured with the same code.
//   node anglecal.mjs  -> cross2d/anglecal.json
import { readFileSync, writeFileSync } from 'node:fs';
import { junctions2D, anglesAt } from './labtools.mjs';
const D = new URL('./cross2d/', import.meta.url).pathname;
const out = {};
for (const c of ['pair-diff', 'row-ABB', 'L3-ABC']) {
  const r = JSON.parse(readFileSync(`${D}${c}.json`, 'utf8'));
  const polys = r.solverPolylines[0];
  const rOut = +(process.argv[2] ?? 0.35), NS = (process.argv[3] ?? '32,64,128,256').split(',').map(Number);
  for (const n of NS) {
    // grid covering the polylines with a margin
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of polys) for (const [x, y] of p.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1;
    const w = Math.ceil((x1 + 1 - x0) * n), h = Math.ceil((y1 + 1 - y0) * n);
    const lab = new Uint8Array(w * h);
    const segs = [];
    for (const p of polys) for (let i = 0; i + 1 < p.pts.length; i++) segs.push([p.pts[i], p.pts[i + 1], p.L, p.R]);
    for (let j = 0; j < h; j++) {
      const y = y0 + (j + 0.5) / n;
      const hits = [];
      for (const [a, b, L, R] of segs) { if ((a[1] <= y) === (b[1] <= y)) continue; hits.push([a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), b[1] > a[1] ? L : R]); }
      hits.sort((p, q) => p[0] - q[0]);
      let k = 0;
      for (let i = 0; i < w; i++) { const x = x0 + (i + 0.5) / n; while (k < hits.length && hits[k][0] < x) k++; lab[j * w + i] = k < hits.length ? hits[k][1] : 0; }
    }
    const img = { w, h, lab, h0: 1 / n, u0: x0, v0: y0 };
    const res = junctions2D(img).filter((J) => J.labs.length === 3).map((J) => anglesAt(img, J, { rOut }));
    out[`${c}-n${n}`] = res.map((a) => a.sectors);
    console.log(c, n, res.map((a) => a.sectors ? Object.entries(a.sectors).map(([k, v]) => `${k}:${v.toFixed(1)}`).join('/') : a.error).join('  '));
  }
}
writeFileSync(`${D}anglecal-r${process.argv[2] ?? 0.35}.json`, JSON.stringify(out, null, 1));
