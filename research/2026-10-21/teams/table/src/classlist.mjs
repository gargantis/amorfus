// Order of classes to tabulate: surface classes seen on terrain (bench16,
// wide) and builds, by summed share, then classes that occur only in the
// shared catalogue (lib/configs.mjs).  node src/classlist.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { buildClassTable, classOf } from './lattice.mjs';
import { CONFIGS } from '../../../lib/configs.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const F = JSON.parse(readFileSync(ROOT + 'res/freq.json', 'utf8'));
const T = buildClassTable();
const tot = new Map();
for (const h of [F.wide.surface.hist, F.buildsAll.surface.hist, F.bench16.surface.hist]) {
  const sum = h.reduce((s, [, k]) => s + k, 0);
  for (const [c, k] of h) tot.set(c, (tot.get(c) ?? 0) + k / sum);
}
const order = [...tot.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
const seen = new Set(order);
const catClasses = {};
for (const cfg of CONFIGS) {
  const map = new Map(cfg.blocks.map((b) => [`${b[0]},${b[1]},${b[2]}`, b[3]]));
  const xs = cfg.blocks.map((b) => b[0]), ys = cfg.blocks.map((b) => b[1]), zs = cfg.blocks.map((b) => b[2]);
  const cs = new Map();
  for (let y = Math.min(...ys); y <= Math.max(...ys) + 1; y++) for (let z = Math.min(...zs); z <= Math.max(...zs) + 1; z++) for (let x = Math.min(...xs); x <= Math.max(...xs) + 1; x++) {
    const lab = []; for (let b = 0; b < 8; b++) lab.push(map.get(`${x - 1 + (b & 1)},${y - 1 + ((b >> 2) & 1)},${z - 1 + ((b >> 1) & 1)}`) ?? 0);
    if (!lab.some((v) => v) || lab.every((v) => v)) continue;
    const { cls } = classOf(T, lab);
    cs.set(cls, (cs.get(cls) ?? 0) + 1);
  }
  catClasses[cfg.name] = [...cs.entries()];
  for (const c of cs.keys()) if (!seen.has(c)) { seen.add(c); order.push(c); }
}
const nSeen = tot.size;
console.log(`terrain/builds classes ${nSeen}, plus catalogue-only ${order.length - nSeen}, total ${order.length}`);
writeFileSync(ROOT + 'res/classlist.json', JSON.stringify({ order, nSeen, share: Object.fromEntries(tot), catClasses }));
