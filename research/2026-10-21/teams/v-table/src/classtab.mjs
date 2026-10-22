// v-table: re-simulate team table's no-volume E2c class table at another n
// (team table's embed/embOpts/measureCorner, imported read-only; output in
// this folder).  node src/classtab.mjs <regime> <n> <topK> [--vol]
// Writes res/table-mine/<regime>_E2c_n<n>_clu[-novol].json (same entry format).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { simulateScene, measureCorner, REGIMES } from '../../table/src/sim.mjs';
import { embed, embOpts, MATS } from '../../table/src/classsim.mjs';

const [regime, nS, topS] = process.argv.slice(2);
const n = +nS, vol = process.argv.includes('--vol');
const TR = new URL('../../table/', import.meta.url).pathname;
const CL = JSON.parse(readFileSync(TR + 'res/classes.json', 'utf8')).classes;
const LIST = JSON.parse(readFileSync(TR + 'res/classlist.json', 'utf8')).order;
const dir = new URL('../res/table-mine/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const out = `${dir}${regime}_E2c_n${n}_clu${vol ? '' : '-novol'}.json`;
const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { regime, emb: 'E2c', n, sem: 'clu', novol: !vol, entries: {} };
const { opts: eo } = embOpts('E2c');
const t0 = performance.now();
for (const id of LIST.slice(0, +topS)) {
  const c = CL[id];
  if (!c.hasAir || c.nMat === 0 || res.entries[id]) continue;
  const rep = c.key.split('').map(Number);
  const t1 = performance.now();
  const sim = simulateScene(embed(rep, 2), { ...REGIMES[regime], n, ...eo, ...(vol ? {} : { volume: false }) }, null);
  const m = measureCorner(sim, [0, 0, 0], rep.map((L) => MATS[L]));
  const r4 = (v) => (v ? v.map((x) => +x.toFixed(4)) : null);
  res.entries[id] = { key: c.key, ms: Math.round(performance.now() - t1), steps: sim.steps, vsn: r4(m.vsn), vseam: r4(m.vseam), seamInCell: m.seamInCell ?? 0 };
  console.log(`${id} ${c.key} n${n}: vsn ${JSON.stringify(res.entries[id].vsn)} vseam ${JSON.stringify(res.entries[id].vseam)} ${res.entries[id].ms} ms`);
  writeFileSync(out, JSON.stringify(res));
}
console.log(`done in ${((performance.now() - t0) / 1000).toFixed(0)} s -> ${out}`);
