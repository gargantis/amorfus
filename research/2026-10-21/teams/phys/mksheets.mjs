// Contact-sheet specs for the FREE catalogue (team phys).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const D = new URL('./', import.meta.url).pathname;
const R = JSON.parse(readFileSync(`${D}free/results.json`, 'utf8'));
const L = { 6: 'A', 7: 'B', 1: 'C', 4: 'D', 2: 'dirt', 3: 'stone' };
const names = Object.keys(R);
const sig = (run) => run.phases.map((p) => `${L[p.mat] ?? p.mat}${p.blocks}${p.comps > 1 ? `(${p.comps} parts!)` : ''}`).join(' ');
const items = [];
for (const name of names) {
  const r = R[name], s1 = r.runs[1], s2 = r.runs[2];
  const differ = sig(s1) !== sig(s2);
  const reg = `FREE n${r.n} j1e-3`;
  items.push({ path: `${D}free/${name}-before.png`, label: `${name}: before\n${r.blocks} blocks, ${s1.clustersStart} clusters` });
  items.push({ path: `${D}free/${name}-s1-view.png`, label: `${name}: ${reg} seed1\n-> ${sig(s1)}${s1.converged ? '' : ' (not conv.)'}` });
  const sl = `${D}free/${name}-s1-slice.png`;
  if (existsSync(sl)) items.push({ path: sl, label: `${name}: slice, seed1${differ ? '\nseed2 -> ' + sig(s2) : ''}` });
  else items.push({ path: `${D}free/${name}-s2-view.png`, label: `${name}: ${reg} seed2\n-> ${sig(s2)}` });
}
const per = 15 * 3;
for (let k = 0; k * per < items.length; k++) {
  const spec = { out: `${D}sheets/free-catalogue-${k + 1}.png`, cols: 6, cell: [270, 203], title: `free foam: before / after / slice (FREE regime, n16 or n12, jitter 1e-3) - part ${k + 1}`, items: items.slice(k * per, (k + 1) * per) };
  writeFileSync(`${D}sheets/free-catalogue-${k + 1}.json`, JSON.stringify(spec, null, 1));
}
// seed comparison for configurations whose outcome depends on the seed
const seedItems = [];
for (const name of names) {
  const r = R[name];
  if (sig(r.runs[1]) === sig(r.runs[2])) continue;
  for (const sd of [1, 2]) {
    seedItems.push({ path: `${D}free/${name}-s${sd}-view.png`, label: `${name}: FREE n${r.n} seed${sd}\n-> ${sig(r.runs[sd])}` });
    if (existsSync(`${D}free/${name}-s${sd}-slice.png`)) seedItems.push({ path: `${D}free/${name}-s${sd}-slice.png`, label: `${name}: slice seed${sd}` });
  }
}
writeFileSync(`${D}sheets/free-seeds.json`, JSON.stringify({ out: `${D}sheets/free-seeds.png`, cols: 4, cell: [300, 225], title: 'FREE: same configuration, two noise seeds (jitter 1e-3), different outcomes', items: seedItems }, null, 1));
console.log(items.length, 'items;', seedItems.length, 'seed items');
