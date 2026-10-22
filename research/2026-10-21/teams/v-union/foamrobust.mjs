// Robustness of the exact solver's X decisions: geometric transforms (8 symmetries
// of the square), mesh size h, hold time and tie tolerance. foam2d.mjs unchanged.
// node foamrobust.mjs <cfg> <xAt "x,y"> [hs] [holds] [tieTols]
import { writeFileSync } from 'node:fs';
import { fromBlocks } from '../phys/foam2d.mjs';
import { CFG2 } from './foamrun.mjs';
const [name, xat, hsA, holdsA, tolsA, Tmax] = process.argv.slice(2);
const [X0, Y0] = xat.split(',').map(Number);
const hs = (hsA ?? '0.04').split(',').map(Number), holds = (holdsA ?? '0.05').split(',').map(Number), tols = (tolsA ?? '0.001').split(',').map(Number);
// symmetries acting on block (x,y) about lattice point (X0,Y0): block centre c = (x+.5, y+.5)
const T = {
  id: (u, v) => [u, v], rot90: (u, v) => [-v, u], rot180: (u, v) => [-u, -v], rot270: (u, v) => [v, -u],
  mirX: (u, v) => [-u, v], mirY: (u, v) => [u, -v], diag: (u, v) => [v, u], anti: (u, v) => [-v, -u],
};
const xform = (blocks, f) => blocks.map(([x, y, z, m]) => { const [u, v] = f(x + 0.5 - X0, y + 0.5 - Y0); return [Math.round(u - 0.5), Math.round(v - 0.5), 0, m]; });
const out = { cfg: name, X: [X0, Y0], runs: [] };
const base = CFG2[name]();
for (const [tn, f] of Object.entries(T)) for (const h of hs) for (const hold of holds) for (const tol of tols) {
  const F = fromBlocks(xform(base, f), { h });
  const t0 = performance.now();
  F.run({ maxTime: +(Tmax ?? 0.6), holdTime: hold, tieTol: tol });
  const ds = F.events.filter((e) => e.kind === 'decide' && Math.hypot(e.at[0], e.at[1]) < 0.3); // X now at the origin
  const d = ds[0];
  const rec = { T: tn, h, hold, tol, ms: Math.round(performance.now() - t0), pick: d ? d.options[d.pick].mats.join('') : 'no-decide', t: d ? +d.t.toFixed(4) : null, decided: d?.decided ?? null, rates: d ? d.options.map((o) => `${o.mats.join('')}:${o.rate.toFixed(5)}`).join(' ') : null };
  out.runs.push(rec);
  console.log(JSON.stringify(rec));
}
const tally = {};
for (const r of out.runs) tally[r.pick] = (tally[r.pick] ?? 0) + 1;
out.tally = tally;
console.log('TALLY', name, JSON.stringify(tally));
writeFileSync(new URL(`./foam/robust-${name}.json`, import.meta.url), JSON.stringify(out, null, 1));
