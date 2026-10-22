// Time series in the exact solver (no topology changes): at the X vertex nearest
// xAt, the two split rates and the pressures of the four regions around it.
// node foamprobe.mjs <cfg> <x,y> [h=0.02] [tmax=0.02]
import { writeFileSync } from 'node:fs';
import { fromBlocks } from '../phys/foam2d.mjs';
import { CFG2 } from './foamrun.mjs';
const [name, xat, hA, tA] = process.argv.slice(2);
const [X0, Y0] = xat.split(',').map(Number);
const h = hA ? +hA : 0.02, tmax = tA ? +tA : 0.02;
const F = fromBlocks(CFG2[name](), { h });
const rows = [];
let steps = 0;
while (F.t < tmax) {
  let hmin = Infinity;
  for (const f of F.films) for (const [p, q] of F.segs(f)) hmin = Math.min(hmin, Math.hypot(F.X[q] - F.X[p], F.Y[q] - F.Y[p]));
  F.step(0.2 * Math.max(hmin, 0.2 * h)); steps++;
  if (steps % 25 === 0) F.remesh();
  if (steps % 2 === 0) {
    let j = -1, best = Infinity;
    for (let i = 0; i < F.X.length; i++) if (F.isJ[i]) { const d = Math.hypot(F.X[i] - X0, F.Y[i] - Y0); if (d < best) { best = d; j = i; } }
    const opts = F.splitOptions(j);
    const regs = F.around(j).map((o) => F.find(o.left));
    rows.push({ t: +F.t.toFixed(5), rates: opts.map((o) => `${o.mats.join('')}:${o.rate.toFixed(5)}`).join(' '), p: regs.map((r) => `${F.mat(r)}:${(F.pressure.get(r) ?? 0).toFixed(4)}`).join(' ') });
  }
}
for (const r of rows) console.log(JSON.stringify(r));
writeFileSync(new URL(`./foam/probe-${name}-h${h}.json`, import.meta.url), JSON.stringify(rows, null, 1));
