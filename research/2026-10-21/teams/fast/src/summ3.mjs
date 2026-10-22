// Summarise t3acc results: per rule, the mean over configurations of the
// per-configuration mean/p95 distances (vertex, quad centre, patch samples).
//   node summ3.mjs <json> [names-filter]
import { readFileSync } from 'node:fs';
const [p, filt] = process.argv.slice(2);
const r = JSON.parse(readFileSync(p, 'utf8'));
const pick = filt ? filt.split(',') : Object.keys(r.runs);
const agg = {};
for (const c of pick) for (const [id, m] of Object.entries(r.runs[c].rules)) {
  const a = agg[id] ?? (agg[id] = { n: 0, v: 0, vp: 0, q: 0, pm: 0, pp: 0, pmax: 0, miss: 0 });
  a.n++; a.v += m.vertex.mean; a.vp += m.vertex.p95; a.q += m.quad.mean; a.pm += m.patch.mean; a.pp += m.patch.p95; a.pmax = Math.max(a.pmax, m.patch.p95); a.miss += m.missing;
}
console.log(`${r.regime}: ${pick.length} configs`);
console.log('rule'.padEnd(11), 'vertexMean vertexP95 quadCtrMean patchMean patchP95 worstPatchP95 missingCorners');
for (const [id, a] of Object.entries(agg).sort((x, y) => x[1].pm / x[1].n - y[1].pm / y[1].n)) console.log(id.padEnd(11), ...[a.v, a.vp, a.q, a.pm, a.pp].map((v) => (v / a.n).toFixed(4).padStart(9)), a.pmax.toFixed(3).padStart(9), String(a.miss).padStart(5));
