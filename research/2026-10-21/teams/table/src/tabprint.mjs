// Print table entries of the top classes side by side (all table files).
//   node src/tabprint.mjs [k]
import { readFileSync, readdirSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const L = JSON.parse(readFileSync(ROOT + 'res/classlist.json', 'utf8'));
const CL = JSON.parse(readFileSync(ROOT + 'res/classes.json', 'utf8')).classes;
const files = readdirSync(ROOT + 'res/table').filter((f) => f.endsWith('.json')).sort();
const tabs = files.map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(ROOT + 'res/table/' + f, 'utf8')).entries]);
const k = +(process.argv[2] ?? 20);
const f3 = (v) => (v ? `[${v.map((x) => x.toFixed(3)).join(',')}]` : '-');
for (const id of L.order.slice(0, k)) {
  const c = CL[id];
  console.log(`class ${id} ${c.key} share ${(100 * (L.share[id] ?? 0) / 3).toFixed(2)}% nMat ${c.nMat} ${c.plateau ? 'plateau' : 'NON-plateau'}${c.ambUnion ? ' ambUnion' : ''}${c.xEdges ? ' X' : ''}`);
  for (const [name, e] of tabs) { const x = e[id]; if (!x) continue; console.log(`   ${name.padEnd(24)} vsn ${f3(x.vsn)} vseam ${x.seamInCell ? f3(x.vseam) : '-'} steps ${x.steps} changes ${x.changes} alive ${x.alive}/${x.phases0}`); }
}
