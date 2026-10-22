// E6a: local L2/L4 at two resolutions. 10x2x4 A slab, FID-0.15 (volume on)
// and FID-0.15-novol, n 12 and n 16 (margin 0.75); one bump at (7, 2, 1).
// Far label changes (>= 2.5 blocks from the bump) and the far top-face
// height change, in units of 1/n; near-field D0 top-height change along the
// row z = 1.5, by distance from the bump.
//   node e6a-terrace.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { run, D0, cellCentre, solidAt } from './physics.mjs';
import { box, distToBlocks, A, r4 } from './common.mjs';

const [out] = process.argv.slice(2);
const slab = box(0, 0, 0, 10, 2, 4, A), bump = [7, 2, 1, A];
const res = { note: '10x2x4 A slab, bump at (7,2,1); margin 0.75', runs: [] };
for (const reg of ['FID-0.15', 'FID-0.15-novol']) for (const n of [12, 16]) {
  const base = run(slab, reg, n, 0.75), pert = run([...slab, bump], reg, n, 0.75);
  const NX = Math.max(base.NX, pert.NX), NY = Math.max(base.NY, pert.NY), NZ = Math.max(base.NZ, pert.NZ);
  const sb = solidAt(base), sp = solidAt(pert);
  let changed = 0, far = 0, maxDist = 0;
  const farDh = {};
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    // column top heights (labels) for far columns
    let tb = -1, tp = -1;
    for (let j = NY - 1; j >= 0; j--) { if (tb < 0 && sb(i, j, k)) tb = j; if (tp < 0 && sp(i, j, k)) tp = j; }
    for (let j = 0; j < NY; j++) {
      if (sb(i, j, k) === sp(i, j, k)) continue;
      changed++;
      const d = distToBlocks(cellCentre(base, i, j, k), [bump]);
      maxDist = Math.max(maxDist, d);
      if (d >= 2.5) far++;
    }
    const p = cellCentre(base, i, 0, k);
    if (distToBlocks([p[0], 2, p[2]], [bump]) >= 2.5 && tb >= 0 && tp >= 0 && tb !== tp) { const key = ((tp - tb) / n).toFixed(4); farDh[key] = (farDh[key] ?? 0) + 1; }
  }
  // D0 near field: top-surface height from D0 along z = 1.5 (a cell-centre row near it), x from the bump outward (-x side)
  const d0b = D0(base, NX, NY, NZ), d0p = D0(pert, NX, NY, NZ);
  const kz = Math.floor((1.5 - base.oz) * n);
  const topH = (D, i) => { for (let j = NY - 1; j > 0; j--) { const a = D[(kz * NY + j) * NX + i], b = D[(kz * NY + j - 1) * NX + i]; if (a <= 0 && b > 0) { const y0 = base.oy + (j - 0.5) / n; return y0 + (b / (b - a)) / n; } } return null; };
  const prof = [];
  for (let i = 0; i < NX; i++) {
    const x = base.ox + (i + 0.5) / n;
    if (x > 7) continue; // the -x side of the bump (bump spans x 7..8)
    const hb = topH(d0b, i), hp = topH(d0p, i);
    prof.push({ x: +x.toFixed(4), dist: +(7 - x).toFixed(4), dh: hb != null && hp != null ? +(hp - hb).toFixed(5) : null });
  }
  prof.sort((a, b) => a.dist - b.dist);
  let dstar = {}; for (const tol of [1 / 256, 1 / 64, 1 / 16]) { let d = 0; for (const q of prof) { if (q.dh == null || Math.abs(q.dh) > tol) d = q.dist; else break; } dstar[tol.toFixed(5)] = r4(d); }
  const lam = (q) => q.phases.map((P, p) => (p && P.alive ? r4(P.lambda) : null)).filter((v) => v != null);
  const row = { regime: reg, n, steps: [base.steps, pert.steps], converged: [!!base.converged, !!pert.converged], cells: base.N, lambdas: { base: lam(base), pert: lam(pert) },
    labelCellsChanged: changed, labelCellsFar: far, maxDistChange: r4(maxDist), farTopHeightChanges: farDh, D0nearDstar_contiguousFromBump: dstar, D0profile: prof.filter((q) => q.dist < 3.2) };
  res.runs.push(row);
  console.log(JSON.stringify({ ...row, D0profile: row.D0profile.slice(0, 14).map((q) => `${q.dist}:${q.dh}`).join(' ') }));
  writeFileSync(out, JSON.stringify(res, null, 1));
}
