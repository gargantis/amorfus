// v-table (T12): share of corners vs share of the table's vertex error by class,
// from my per-corner records (reference onD). node src/errshare.mjs <score.json> [placement=tabNV]
import { readFileSync } from 'node:fs';
const [f, pk = 'tabNV'] = process.argv.slice(2);
const TR = new URL('../../table/', import.meta.url).pathname;
const CL = JSON.parse(readFileSync(TR + 'res/classes.json', 'utf8')).classes;
const R = JSON.parse(readFileSync(f, 'utf8'));
const by = new Map(); let N = 0, E = 0;
for (const [name, row] of Object.entries(R.scenes)) {
  if (/shift/.test(name) || !row.cornerRecs) continue;
  for (const r of row.cornerRecs) { const e = r.e[pk]; const a = by.get(r.cls) ?? { n: 0, e: 0 }; a.n++; a.e += e; by.set(r.cls, a); N++; E += e; }
}
const amb = [...by.entries()].filter(([c]) => CL[c].ambUnion);
const sum = (L) => L.reduce((s, [, a]) => ({ n: s.n + a.n, e: s.e + a.e }), { n: 0, e: 0 });
const pick = [97, 27, 92].filter((c) => by.has(c)).map((c) => [c, by.get(c)]);
const P = sum(pick), A = sum(amb);
console.log(`${f} ${pk}: corners ${N}, mean error ${(E / N).toFixed(4)}`);
console.log(`classes 97/27/92: ${(100 * P.n / N).toFixed(1)}% of corners, ${(100 * P.e / E).toFixed(1)}% of error; per class: ${pick.map(([c, a]) => `${c}: n ${a.n} mean ${(a.e / a.n).toFixed(3)}`).join(', ')}`);
console.log(`all ambiguous-union classes: ${(100 * A.n / N).toFixed(1)}% of corners, ${(100 * A.e / E).toFixed(1)}% of error, mean ${(A.e / A.n).toFixed(3)} vs others ${((E - A.e) / (N - A.n)).toFixed(3)}`);
const top = [...by.entries()].sort((a, b) => b[1].e - a[1].e).slice(0, 8);
console.log('top error classes: ' + top.map(([c, a]) => `${c}(${CL[c].key}) n ${a.n} err-share ${(100 * a.e / E).toFixed(1)}% mean ${(a.e / a.n).toFixed(3)}`).join('; '));
