// Exact solver with its normal topology handling: pressures of the X regions and
// the order of events up to just after the decision at the X of interest.
// node foamdecide.mjs <cfg> <x,y> [h=0.02] [tieTol=0.001]
import { writeFileSync } from 'node:fs';
import { fromBlocks } from '../phys/foam2d.mjs';
import { CFG2 } from './foamrun.mjs';
import { xList } from './vu.mjs';
const [name, xat, hA, tolA] = process.argv.slice(2);
const [X0, Y0] = xat.split(',').map(Number);
const h = hA ? +hA : 0.02, tol = tolA ? +tolA : 0.001;
const blocks = CFG2[name]();
const X = xList(blocks).xs.find((x) => x.at[0] === X0 && x.at[1] === Y0);
const regs = X.pairs.flatMap((p) => p.ph.map((r) => [p.mat, r]));
const F = fromBlocks(blocks, { h });
const rows = [];
let decidedAt = null;
for (let T = 0.001; T <= 0.06; T += 0.001) {
  F.run({ maxTime: T, holdTime: 0.05, tieTol: tol });
  const d = F.events.find((e) => e.kind === 'decide' && Math.hypot(e.at[0] - X0, e.at[1] - Y0) < 0.3);
  const merges = F.events.filter((e) => e.kind === 'merge').length;
  rows.push({ t: +F.t.toFixed(4), merges, p: regs.map(([m, r]) => `${m}:${(F.pressure?.get(F.find(r)) ?? NaN).toFixed(4)}`).join(' '), decided: d ? d.options[d.pick].mats.join('') : null });
  if (d && decidedAt === null) { decidedAt = F.t; }
  if (decidedAt !== null && F.t > decidedAt + 0.003) break;
}
for (const r of rows) console.log(JSON.stringify(r));
const evs = F.events.filter((e) => e.kind === 'decide' || e.kind === 'merge').map((e) => `${e.t.toFixed(4)} ${e.kind}${e.kind === 'decide' ? ' at ' + e.at.map((v) => v.toFixed(2)) + ' -> ' + e.options[e.pick].mats.join('') : ' mat ' + e.mat}`);
console.log(evs.join('\n'));
writeFileSync(new URL(`./foam/decide-${name}-h${h}-tol${tol}.json`, import.meta.url), JSON.stringify({ rows, events: evs }, null, 1));
