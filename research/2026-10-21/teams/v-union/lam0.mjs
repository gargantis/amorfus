// Instantaneous pressures at the start: engine lambda after step 1 (merging off
// for that step, so each original phase keeps its own lambda) and the exact
// solver's Lagrange multipliers at t ~ 0.003 (h 0.02, before any X decision).
// For each X: the pair pressures (mean of the two) and cluster sizes.
// node lam0.mjs <cfg,...> [n=32]
import { writeFileSync } from 'node:fs';
import { setup, step, gaussKernel, DEFAULTS } from '../../lib/mbo.mjs';
import { fromBlocks } from '../phys/foam2d.mjs';
import { xList } from './vu.mjs';
import { CFG2 } from './foamrun.mjs';
const names = process.argv[2].split(','), n = process.argv[3] ? +process.argv[3] : 32;
const out = {};
for (const name of names) {
  const blocks = CFG2[name]();
  const X = xList(blocks);
  const o = { ...DEFAULTS, dims: 2, n, merge: false };
  const sim = setup(blocks, o);
  step(sim, o, gaussKernel(0.2 * n));
  const lamE = sim.phases.map((P) => P.lambda ?? 0);
  const F = fromBlocks(blocks, { h: 0.02 });
  F.run({ maxTime: 0.003, holdTime: 1, tieTol: 1e9 });
  const lamF = (r) => F.pressure?.get(F.find(r)) ?? null;
  out[name] = X.xs.filter((x) => x.pairs.every((p) => p.mat)).map((x) => {
    const pr = x.pairs.map((p) => ({ mat: p.mat, sizes: p.sizes, lamE: p.ph.map((q) => +lamE[q].toFixed(4)), lamF: p.ph.map((q) => +(lamF(q) ?? NaN).toFixed(4)) }));
    const mE = pr.map((p) => (p.lamE[0] + p.lamE[1]) / 2), mF = pr.map((p) => (p.lamF[0] + p.lamF[1]) / 2);
    return { at: x.at.slice(0, 2), pairs: pr, highE: mE[0] > mE[1] ? pr[0].mat : mE[1] > mE[0] ? pr[1].mat : 'tie', highF: mF[0] > mF[1] + 1e-9 ? pr[0].mat : mF[1] > mF[0] + 1e-9 ? pr[1].mat : 'tie', rule4: x.rule4, size: x.size };
  });
  for (const r of out[name]) console.log(name.padEnd(14), JSON.stringify(r));
}
writeFileSync(new URL(`./res-lam0-${names.join('_').slice(0, 60)}.json`, import.meta.url), JSON.stringify(out, null, 1));
