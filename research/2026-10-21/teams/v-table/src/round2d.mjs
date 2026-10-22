// v-table (c): what rounding can a block-resolution surface-nets mesh show?
// 2D cross-section of a convex 90-degree block edge rounded with a fillet
// of radius r (solid = x<=0, y<=0 with the corner replaced by a quarter
// circle centred at (-r,-r)). A surface-nets mesh puts one vertex per
// lattice point: (-k, 0) on the top face, (0, -k) on the side, and the edge
// vertex at (-t, -t). Compare
//   cube        all offsets 0
//   on-surface  every vertex moved onto the curve (edge vertex along the
//               bisector, face vertices along the face normal)
//   best-t      neighbours on-surface, edge vertex t chosen to minimise the
//               symmetric mean distance
//   best-all    edge vertex and the first two neighbours each side optimised
//               (coordinate search), the rest on-surface
// Error = symmetric mean distance (curve->mesh and mesh->curve, arclength
// weighted) over the profile within 4 blocks of the edge. Concave edge
// (fillet inside the corner of air) gives the same numbers by symmetry of
// the distance; not repeated.
import { writeFileSync } from 'node:fs';

const L = 4;
function curvePts(r, h = 0.002) {
  const pts = [];
  // top face from x=-L to x=-r (y=0), arc, side face from y=-r to y=-L
  for (let x = -L; x <= -r; x += h) pts.push([x, 0]);
  const arcN = Math.max(8, Math.ceil((Math.PI / 2) * r / h));
  for (let i = 0; i <= arcN; i++) { const a = (Math.PI / 2) * (i / arcN); pts.push([-r + r * Math.sin(a), -r + r * Math.cos(a)]); }
  for (let y = -r; y >= -L; y -= h) pts.push([0, y]);
  return pts;
}
const surfY = (r, x) => (x <= -r ? 0 : -r + Math.sqrt(Math.max(0, r * r - (x + r) * (x + r)))); // top profile height at x (x in [-L,0])
function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1]], ap = [p[0] - a[0], p[1] - a[1]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1)));
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1]);
}
// exact distance to the rounded-quadrant boundary: S = Q_r + disk(r), Q_r = {x<=-r, y<=-r}
function curveDist(r, p) {
  const dx = Math.max(0, p[0] + r), dy = Math.max(0, p[1] + r);
  if (dx === 0 && dy === 0) return Math.min(-p[0], -p[1]);
  return Math.abs(Math.hypot(dx, dy) - r);
}
function polyDist(p, poly) { let d = Infinity; for (let i = 0; i + 1 < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[i + 1])); return d; }
function err(r, poly, C) {
  let s1 = 0;
  for (const p of C) s1 += polyDist(p, poly);
  s1 /= C.length;
  // mesh -> curve: sample the polyline uniformly
  let s2 = 0, n2 = 0;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i], b = poly[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(2, Math.ceil(len / 0.01));
    for (let j = 0; j < k; j++) { const t = (j + 0.5) / k, p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; s2 += curveDist(r, p) * len / k; n2 += len / k; }
  }
  s2 /= n2;
  return 0.5 * (s1 + s2);
}
// polyline: vertices (-k, yk) on top for k = L..1, edge (-t,-t), (xk, -k) on the side
function poly(r, t, top, side) {
  const P = [];
  for (let k = L; k >= 1; k--) P.push([-k, top[k]]);
  P.push([-t, -t]);
  for (let k = 1; k <= L; k++) P.push([side[k], -k]);
  return P;
}
const rows = [];
for (const r of [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 2, 3]) {
  const C = curvePts(r);
  const onTop = [0], onSide = [0];
  for (let k = 1; k <= L; k++) { onTop.push(surfY(r, -k)); onSide.push(surfY(r, -k)); }
  const zero = new Array(L + 1).fill(0);
  const tOn = r * (1 - Math.SQRT1_2);
  const eCube = err(r, poly(r, 0, zero, zero), C);
  const eOn = err(r, poly(r, tOn, onTop, onSide), C);
  // best t with neighbours on-surface (they are 0 for r <= 1)
  let bt = 0, be = Infinity;
  for (let t = 0; t <= 0.6; t += 0.005) { const e = err(r, poly(r, t, onTop, onSide), C); if (e < be) { be = e; bt = t; } }
  // best-all: coordinate search on t, top[1], top[2] (= side by symmetry)
  let T = bt, a1 = onTop[1], a2 = onTop[2], bestE = be;
  for (let sweep = 0; sweep < 3; sweep++) {
    for (const which of [0, 1, 2]) {
      for (let v = -0.5; v <= 0.6; v += 0.01) {
        const tt = which === 0 ? v : T, q1 = which === 1 ? -v : a1, q2 = which === 2 ? -v : a2;
        if (tt < 0 || tt > 0.6) continue;
        const top = onTop.slice(); top[1] = q1; top[2] = q2;
        const e = err(r, poly(r, tt, top, top), C);
        if (e < bestE) { bestE = e; T = tt; a1 = q1; a2 = q2; }
      }
    }
  }
  // the shape's own deviation from the cube: area between edge and fillet per unit edge length / profile length
  const row = { r, cube: +eCube.toFixed(4), onSurface: +eOn.toFixed(4), tOn: +tOn.toFixed(3), bestT: +be.toFixed(4), tBest: +bt.toFixed(3),
    bestAll: +bestE.toFixed(4), tAll: +T.toFixed(3), nb1: +a1.toFixed(3), nb2: +a2.toFixed(3),
    captured: +(1 - bestE / eCube).toFixed(3), onBeatsCube: eOn < eCube };
  rows.push(row);
  console.log(JSON.stringify(row));
}
writeFileSync(new URL('../res/round2d.json', import.meta.url), JSON.stringify({ note: '2D convex edge, fillet radius r, lattice spacing 1, symmetric mean distance over 4 blocks each side', rows }, null, 1));
