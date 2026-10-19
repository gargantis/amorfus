// "What you see is what you hit": if collision stays on the coarse (hints)
// mesh while the refined mesh is drawn, how far apart are they?
//  dist: each refined vertex's distance to the coarse surface (rms / max)
//  feet: top-down height difference of the walkable top surface (rms / max,
//        share of samples off by > 0.05 block)
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
function ptTri(p, a, b, c) {
  // squared distance point-triangle (Ericson)
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); const q = [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; const d = sub(p, q); return dot(d, d); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); const q = [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; const d = sub(p, q); return dot(d, d); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); const q = [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; const d = sub(p, q); return dot(d, d); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  const q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  const d = sub(p, q); return dot(d, d);
}
function dist(R, C) {
  // bucket coarse triangles by cell
  const grid = new Map();
  const P = (m, v) => [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
  for (let t = 0; t < C.T; t++) {
    const vs = [C.tri[t * 3], C.tri[t * 3 + 1], C.tri[t * 3 + 2]].map((v) => P(C, v));
    const lo = [0, 1, 2].map((a) => Math.floor(Math.min(vs[0][a], vs[1][a], vs[2][a]))), hi = [0, 1, 2].map((a) => Math.floor(Math.max(vs[0][a], vs[1][a], vs[2][a])));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = `${x},${y},${z}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(vs); }
  }
  const ds = [];
  for (let v = 0; v < R.V; v++) {
    const p = P(R, v);
    let best = Infinity;
    const c0 = p.map(Math.floor);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(`${c0[0] + dx},${c0[1] + dy},${c0[2] + dz}`);
      if (list) for (const [a, b, c] of list) best = Math.min(best, ptTri(p, a, b, c));
    }
    if (Number.isFinite(best)) ds.push(Math.sqrt(best));
  }
  const s = core.stats(ds);
  return { rms: s.rms, max: s.maxAbs };
}
function feet(R, C) {
  const a = rasterTopDown(R, { S: 8 }), b = rasterTopDown(C, { S: 8 });
  const d = [];
  for (let i = 0; i < a.top.length; i++) if (Number.isFinite(a.top[i]) && Number.isFinite(b.top[i])) d.push(a.top[i] - b.top[i]);
  const s = core.stats(d);
  return { rms: s.rms, max: s.maxAbs, over5cm: d.filter((x) => Math.abs(x) > 0.05).length / d.length };
}
const coarse = await import(new URL('../../approaches/hints.mjs', import.meta.url).href);
const scenes = ['terrace-disc', 'terrace-1:2', 'tower-r4.6', 'mound-r6.4', 'pit-r5.4', 'ramp-1:4', 'ramp-1:8', 'hinted-hill'];
for (const n of process.argv.slice(2)) {
  const M = await import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href);
  const rows = [];
  for (const s of ALL_SCENES.filter((x) => scenes.includes(x.name))) {
    const R = M.mesh(core.buildRegion(s.cell, M.apron ?? 10), null, core);
    const C = coarse.mesh(core.buildRegion(s.cell, 10), null, core);
    const d = dist(R, C), f = feet(R, C);
    rows.push(`${s.name}: surf ${d.rms.toFixed(3)}/${d.max.toFixed(3)} feet ${f.rms.toFixed(3)}/${f.max.toFixed(3)} >5cm ${(100 * f.over5cm).toFixed(1)}%`);
  }
  console.log(`${n}\n  ${rows.join('\n  ')}`);
}
