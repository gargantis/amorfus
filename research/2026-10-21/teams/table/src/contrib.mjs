// Which classes carry the error of the no-volume E2c table on terrain
// (all 51 windows, twins excluded).  node src/contrib.mjs > logs/contrib.log
import { readFileSync } from 'node:fs';
import { symPointInv } from './lattice.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const CL = JSON.parse(readFileSync(ROOT + 'res/classes.json', 'utf8')).classes;
for (const reg of ['FID-0.15', 'FINITE-4']) {
  const tab = JSON.parse(readFileSync(`${ROOT}res/table/${reg}_E2c_n12_clu-novol.json`, 'utf8')).entries;
  const S = JSON.parse(readFileSync(`${ROOT}res/scenes/terrain_${reg}_n12.json`, 'utf8'));
  const by = new Map(); let tot = 0, n = 0;
  for (const [nm, sc] of Object.entries(S.scenes)) {
    if (nm.endsWith('-shift')) continue;
    for (const c of sc.corners) {
      if (!c.vref) continue;
      const e = tab[c.cls]; if (!e || !e.vsn) continue;
      const v = symPointInv(c.g, e.vseam && e.seamInCell ? e.vseam : e.vsn);
      const err = d3(v, c.vref);
      tot += err; n++;
      const r = by.get(c.cls) ?? { n: 0, sum: 0 }; r.n++; r.sum += err; by.set(c.cls, r);
    }
  }
  console.log(`== ${reg}: no-volume E2c table on terrain, ${n} corners, mean ref error ${(tot / n).toFixed(4)}; classes by share of the total error`);
  for (const [cls, r] of [...by.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 10)) {
    const k = CL[cls];
    console.log(`  c${cls} ${k.key} nMat ${k.nMat}${k.ambUnion ? ' ambUnion' : ''}: n ${r.n} (${(100 * r.n / n).toFixed(1)}% of corners), mean error ${(r.sum / r.n).toFixed(3)}, ${(100 * r.sum / tot).toFixed(1)}% of total error`);
  }
}
