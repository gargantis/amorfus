// Why do the interpolated and cell-exact tunnel clearances disagree (BOX20-FID-0.15)?
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { simulate } from './mbo-look.mjs';
import { byName } from '../../../lib/configs.mjs';
import { REGIMES } from './sweep.mjs';
import * as M from './lm.mjs';
const { engine, ...o } = REGIMES[process.argv[2]];
const sim = simulate(byName('tunnel').blocks, o);
const F = M.fields(sim);
for (const z of [1.475, 1.5, 1.525, 0.775, 2.275]) {
  const lab = M.tunnelClear(F.lab, z, 2.0, 0.5, 2.5), D = M.tunnelClear(F.D, z, 2.0, 0.5, 2.5);
  console.log('z', z, 'lab-interp', lab.clearHeightAtW.toFixed(3), 'D', D.clearHeightAtW.toFixed(3), 'cells', JSON.stringify(M.tunnelClearCells(sim, z, 2.0, 0.5, 2.5)));
}
// floor and roof heights per x on the cell plane containing z = 1.525
const { n, NX, NY, ox, oy, oz, label } = sim; const k = Math.floor((1.525 - oz) * n), jc = Math.floor((2 - oy) * n);
const row = [];
for (let i = Math.floor((0.9 - ox) * n); i < Math.ceil((2.1 - ox) * n); i++) {
  let lo = jc, hi = jc; const at = (j) => label[(k * NY + j) * NX + i];
  if (at(jc)) { row.push(`${(ox + (i + 0.5) / n).toFixed(3)}:solid`); continue; }
  while (!at(lo - 1)) lo--; while (!at(hi + 1)) hi++;
  row.push(`${(ox + (i + 0.5) / n).toFixed(3)}:[${(oy + lo / n).toFixed(2)},${(oy + (hi + 1) / n).toFixed(2)}]`);
}
console.log(row.join(' '));
