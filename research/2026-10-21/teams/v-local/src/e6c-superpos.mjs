// E6c: does superposition of two features hold under FINITE-4 for bumps and
// pits (local L13 tested only B inclusions)? 12x2x5 A slab, n 12, margin 1.
// residual = D0(pair) - D0(f1) - D0(f2) + D0(base), max over cells within
// 1.5 blocks of either feature; also label cells where pair != superposed.
//   node e6c-superpos.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { run, D0, cellCentre } from './physics.mjs';
import { box, distToBlocks, A, B, r4 } from './common.mjs';

const [out] = process.argv.slice(2);
const slab = box(0, 0, 0, 12, 2, 5, A);
const X0 = 3;
const feat = {
  bump: (x) => ({ add: [[x, 2, 2, A]], rem: [], mark: [[x, 2, 2, A]] }),
  pit: (x) => ({ add: [], rem: [[x, 1, 2]], mark: [[x, 1, 2, A]] }),
  incl: (x) => ({ recol: [[x, 1, 2]], add: [], rem: [], mark: [[x, 1, 2, B]] }),
};
const apply = (base, fs) => {
  let L = base.slice();
  for (const f of fs) {
    L = L.filter((b) => !f.rem.some((r) => r[0] === b[0] && r[1] === b[1] && r[2] === b[2]));
    if (f.recol) L = L.map((b) => (f.recol.some((r) => r[0] === b[0] && r[1] === b[1] && r[2] === b[2]) ? [b[0], b[1], b[2], B] : b));
    L = L.concat(f.add);
  }
  return L;
};
const res = { note: 'FINITE-4, n 12, 12x2x5 A slab, features at x=3 and x=3+s on the centre row', runs: [] };
const bbox = [0, 0, 0, 11, 2, 4];
for (const [kind, mk] of Object.entries(feat)) {
  for (const reg of ['FINITE-4']) {
    // force a common grid: add a far invisible frame? use engine bbox via identical extents: put all runs on blocks + a dummy? -> instead compare on the frame of the largest sim
    const base = run(slab, reg, 12, 1.0);
    for (const s of [2, 3, 4]) {
      const f1 = mk(X0), f2 = mk(X0 + s);
      const r1 = run(apply(slab, [f1]), reg, 12, 1.0), r2 = run(apply(slab, [f2]), reg, 12, 1.0), r12 = run(apply(slab, [f1, f2]), reg, 12, 1.0);
      const sims = [base, r1, r2, r12];
      for (const q of sims) if (Math.abs(q.ox - base.ox) > 1e-9 || Math.abs(q.oy - base.oy) > 1e-9 || Math.abs(q.oz - base.oz) > 1e-9) throw new Error('origin differs');
      const NX = Math.max(...sims.map((q) => q.NX)), NY = Math.max(...sims.map((q) => q.NY)), NZ = Math.max(...sims.map((q) => q.NZ));
      const [d0, d1, d2, d12] = sims.map((q) => D0(q, NX, NY, NZ));
      let maxRes = 0, cells = 0, at = null;
      const marks = [...f1.mark, ...f2.mark];
      for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const p = cellCentre(base, i, j, k);
        if (distToBlocks(p, marks) > 1.5) continue;
        const c = (k * NY + j) * NX + i;
        const r = Math.abs(d12[c] - d1[c] - d2[c] + d0[c]);
        if (r > maxRes) { maxRes = r; at = p.map((v) => +v.toFixed(3)); }
        cells++;
      }
      const lam = (q) => q.phases.map((P, p) => (p && P.alive ? r4(P.lambda) : null)).filter((v) => v != null);
      const row = { kind, regime: reg, s, maxResidualD0: +maxRes.toExponential(3), at, cellsCompared: cells, lambdas: { base: lam(base), f1: lam(r1), f2: lam(r2), pair: lam(r12) } };
      res.runs.push(row);
      console.log(JSON.stringify(row));
      writeFileSync(out, JSON.stringify(res, null, 1));
    }
  }
}
void bbox;
