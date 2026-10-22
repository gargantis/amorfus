// debug: compare my on-surface vertex and table offsets with team table's stored per-corner records
import { readFileSync } from 'node:fs';
import { sceneSet } from './scenes.mjs';
import { loadCache } from './simcache.mjs';
import { makeField, onSurface } from './meshlib.mjs';
import { loadTable, tableOffset } from './score.mjs';
import { symPointInv } from '../../table/src/lattice.mjs';
const [regime, name] = process.argv.slice(2);
const TROOT = new URL('../../table/', import.meta.url).pathname;
const ref = JSON.parse(readFileSync(`${TROOT}res/scenes/terrain_${regime}_n12.json`, 'utf8')).scenes[name];
const sc = sceneSet('t1').find((s) => s.name === name);
const c = loadCache(regime, 12, name);
const fd = makeField(c, 'D');
const nv = loadTable(`${TROOT}res/table/${regime}_E2c_n12_clu-novol.json`);
let dOn = 0, dTabMine = 0, dTabTheirs = 0, k = 0, eMine = 0;
for (const r of ref.corners) {
  if (!r.vsn) continue;
  const lab8 = []; for (let b = 0; b < 8; b++) lab8.push(sc.get(r.c[0] - 1 + (b & 1), r.c[1] - 1 + ((b >> 2) & 1), r.c[2] - 1 + ((b >> 1) & 1)));
  const v = onSurface(fd, r.c);
  const t = tableOffset(nv, lab8);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  dOn += d(v, r.vsn); eMine += d(t, r.vref); { const e = nv[r.cls]; const vv = e.vseam && e.seamInCell ? e.vseam : e.vsn; dTabTheirs += d(symPointInv(r.g, vv), r.vref); } dTabMine += d(t, v); k++;
  if (k <= 6) console.log(r.c, 'cls', r.cls, 'mine', v.map((x) => x.toFixed(3)), 'theirs', r.vsn, 'vref', r.vref, 'tab', t.map((x) => x.toFixed(3)), 'theirCls', r.cls, r.g);
}
console.log({ k, meanMyOnVsTheirVsn: (dOn / k).toFixed(4), meanTabVsTheirVref: (eMine / k).toFixed(4), theirStoredErr: (dTabTheirs / k).toFixed(4), meanTabVsMyOn: (dTabMine / k).toFixed(4) });
