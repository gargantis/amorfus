// Task 1, split into near field (contiguous from the perturbed block along the
// centre line, D0 and labels) and far field (> 2.5 blocks), per regime/kind.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('./res/t1/', import.meta.url);
const TOL = { '1/256': 1 / 256, '1/64': 1 / 64, '1/16': 1 / 16 };
const out = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('seam')).sort()) {
  const r = JSON.parse(readFileSync(new URL(f, dir)));
  const ds = Object.keys(r.runs).map(Number).sort((a, b) => a - b);
  const near = {}, nearLab = {}; let farD0 = 0, farLab = 0, farCells = 0, lamChanged = false; const perD = [];
  for (const d of ds) {
    const R = r.runs[d]; const a = 2 + d, b = 3 + d;
    const dd0 = R.profC0.map((p, i) => (p[0] !== null && r.base.profC0[i][0] !== null ? p[0] - r.base.profC0[i][0] : null));
    const ddl = R.profC.map((p, i) => (p[1] !== null && r.base.profC[i][1] !== null ? p[1] - r.base.profC[i][1] : null));
    const radius = (arr, tol) => {
      let rmax = 0;
      for (const dir of [-1, 1]) {
        // start at the first sample outside the block on this side
        let i = dir > 0 ? r.xs.findIndex((x) => x > b) : (() => { let k = -1; r.xs.forEach((x, j) => { if (x < a) k = j; }); return k; })();
        for (; i >= 0 && i < r.xs.length; i += dir) {
          const v = arr[i]; if (v === null || Math.abs(v) <= tol) break;
          rmax = Math.max(rmax, Math.max(a - r.xs[i], r.xs[i] - b) + 0.125);
        }
      }
      return +rmax.toFixed(3);
    };
    const rd = Object.fromEntries(Object.entries(TOL).map(([k, t]) => [k, radius(dd0, t)]));
    const rl = radius(ddl, 1e-6);
    for (const [k, v] of Object.entries(rd)) near[k] = Math.max(near[k] ?? 0, v);
    nearLab.any = Math.max(nearLab.any ?? 0, rl);
    let fD = 0, fL = 0;
    r.xs.forEach((x, i) => { const dist = Math.max(a - x, 0, x - b); if (dist > 2.5) { if (dd0[i] !== null) fD = Math.max(fD, Math.abs(dd0[i])); if (ddl[i] !== null) fL = Math.max(fL, Math.abs(ddl[i])); } });
    let fc = 0; for (const [k, v] of Object.entries(R.labelDiff.bins)) if (+k >= 2.5) fc += v;
    farD0 = Math.max(farD0, fD); farLab = Math.max(farLab, fL); farCells = Math.max(farCells, fc);
    const lb = r.base.phases[0].lamRun, lp = R.info.phases[0].lamRun;
    if (Math.abs(lb - lp) > 1e-6) lamChanged = true;
    perD.push({ d, nearD0: rd, nearLab: rl, farD0: +fD.toFixed(4), farLab: +fL.toFixed(4), farCells: fc, lamA: lp, steps: R.info.steps });
  }
  out[`${r.regName}|${r.kind}`] = { near, nearLab, farD0: +farD0.toFixed(4), farLab: +farLab.toFixed(4), farLabelCells: farCells, lamBase: r.base.phases[0].lamRun, lamChanged, baseVol: r.base.phases[0].volume, baseSteps: r.base.steps, baseConverged: r.base.converged, perD };
}
writeFileSync(new URL('./res/t1-nearfar.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('regime|kind'.padEnd(26), 'near d* D0 (1/256 1/64 1/16)'.padEnd(30), 'near labels', ' far |dD0| far |dLab| far cells', ' lam base -> changed?', 'base vol');
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(26), `${v.near['1/256']} ${v.near['1/64']} ${v.near['1/16']}`.padEnd(30), String(v.nearLab.any).padEnd(11), String(v.farD0).padEnd(9), String(v.farLab).padEnd(9), String(v.farLabelCells).padEnd(9), v.lamBase, v.lamChanged, v.baseVol);
