// Summarise a t2 results JSON: per model, mean over configs of surface mean /
// p95 / max, seam mean, |volume error| mean and worst; also per-config table.
//   node summ.mjs <json> [--per]
import { readFileSync } from 'node:fs';
const [path, flag] = process.argv.slice(2);
const r = JSON.parse(readFileSync(path, 'utf8'));
const agg = {};
for (const [cfg, row] of Object.entries(r.runs)) for (const [id, m] of Object.entries(row.models)) {
  const a = agg[id] ?? (agg[id] = { n: 0, sm: 0, sp95: 0, smax: 0, worst: 0, seam: 0, seamN: 0, seamMax: 0, vabs: 0, vN: 0, vworst: 0, bias: 0, unm: 0 });
  a.n++; a.sm += m.surf.mean; a.sp95 += m.surf.p95; a.smax = Math.max(a.smax, m.surf.max); a.worst = Math.max(a.worst, m.surf.p95); a.bias += m.surf.bias; a.unm += m.surf.unmatched;
  if (m.seam.n) { a.seam += m.seam.mean; a.seamN++; a.seamMax = Math.max(a.seamMax, m.seam.p95); }
  for (const v of Object.values(m.volErr)) { a.vabs += Math.abs(v); a.vN++; a.vworst = Math.max(a.vworst, Math.abs(v)); }
}
console.log(`${r.regime}: ${Object.keys(r.runs).length} configs`);
console.log('model'.padEnd(14), 'surfMean p95mean worstP95 bias  unm | seamMean worstSeamP95 | |vol|mean |vol|worst');
for (const [id, a] of Object.entries(agg).sort((x, y) => x[1].sm / x[1].n - y[1].sm / y[1].n)) {
  console.log(id.padEnd(14), (a.sm / a.n).toFixed(4).padStart(8), (a.sp95 / a.n).toFixed(4).padStart(7), a.worst.toFixed(3).padStart(8), (a.bias / a.n).toFixed(3).padStart(6), String(a.unm).padStart(4), '|', (a.seamN ? a.seam / a.seamN : NaN).toFixed(4).padStart(8), a.seamMax.toFixed(3).padStart(8), '|', (a.vabs / a.vN).toFixed(3).padStart(8), a.vworst.toFixed(3).padStart(8));
}
if (flag === '--per') for (const [cfg, row] of Object.entries(r.runs)) {
  console.log(cfg, Object.entries(row.models).map(([id, m]) => `${id}:${m.surf.mean}/${m.surf.p95}`).join(' '));
}
