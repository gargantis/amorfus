// v-table: aggregate res/score/*.json into group tables.
//   node src/agg.mjs <file.json...>   (prints, and writes res/agg/<basename>.json)
// Area-weighted: m2s by mesh area, s2m by sim surface area, sym = their mean;
// vtx (distance to the on-surface vertex of the same field) by corner count.
// 'wins' = scenes where the placement's sym beats the cube mesh's.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { sceneSet } from './scenes.mjs';

const surfaceKind = new Map();
function kindOf(set, name) {
  const key = `${set}|${name}`;
  if (surfaceKind.has(key)) return surfaceKind.get(key);
  let k = 'build';
  if (set !== 'b' && set !== 'cat') {
    const sc = sceneSet(set).find((s) => s.name === name);
    let top = 0, solid = 0;
    for (let y = sc.evalLo[1] - 1; y <= sc.evalHi[1]; y++) for (let z = sc.evalLo[2] - 1; z <= sc.evalHi[2]; z++) for (let x = sc.evalLo[0] - 1; x <= sc.evalHi[0]; x++) {
      const m = sc.get(x, y, z); if (m) { solid++; if (m !== 3) top++; }
    }
    k = top > 0 ? 'top' : 'cave';
  }
  surfaceKind.set(key, k);
  return k;
}
const groupsOf = (set, name) => {
  const g = [];
  if (set === 'b') return ['builds'];
  if (set === 'cat') return ['catalogue'];
  if (/shift/.test(name)) return [];
  g.push(`${set}-all`);
  g.push(`${set}-${/s$/.test(name) ? 'seam' : 'random'}`);
  g.push(`${set}-${kindOf(set, name)}`);
  return g;
};
const out = {};
for (const f of process.argv.slice(2)) {
  const R = JSON.parse(readFileSync(f, 'utf8'));
  const acc = {};
  for (const [name, row] of Object.entries(R.scenes)) {
    for (const g of groupsOf(R.set, name)) {
      for (const [pk, byF] of Object.entries(row.place)) for (const [fk, s] of Object.entries(byF)) {
        const a = ((acc[g] ??= {})[fk] ??= {})[pk] ??= { m: 0, ma: 0, s: 0, sa: 0, b: 0, v: 0, vn: 0, wins: 0, n: 0, m95: 0, s95: 0 };
        a.m += s.m2s * s.meshArea; a.ma += s.meshArea; a.s += s.s2m * s.simArea; a.sa += s.simArea; a.b += s.bias * s.meshArea;
        a.v += s.vtx * row.corners; a.vn += row.corners; a.n++; a.m95 += s.m2sP95; a.s95 += s.s2mP95;
        if (s.sym < byF.cube?.sym ?? Infinity) a.wins++;
        // keep cube sym for wins on other placements
        if (!row.place.cube) continue;
        if (pk !== 'cube' && s.sym < row.place.cube[fk].sym) a.w2 = (a.w2 ?? 0) + 1;
      }
    }
  }
  const tab = {};
  for (const [g, byF] of Object.entries(acc)) for (const [fk, byP] of Object.entries(byF)) {
    const rows = Object.entries(byP).map(([pk, a]) => {
      const m2s = a.m / a.ma, s2m = a.s / a.sa;
      return { place: pk, m2s: +m2s.toFixed(4), s2m: +s2m.toFixed(4), sym: +((m2s + s2m) / 2).toFixed(4), bias: +(a.b / a.ma).toFixed(4), vtx: +(a.v / a.vn).toFixed(4),
        m2sP95: +(a.m95 / a.n).toFixed(3), s2mP95: +(a.s95 / a.n).toFixed(3), beatsCube: `${pk === 'cube' ? '-' : (a.w2 ?? 0)}/${a.n}` };
    }).sort((x, y) => x.sym - y.sym);
    (tab[g] ??= {})[fk] = rows;
  }
  out[basename(f)] = { regime: R.regime, set: R.set, n: R.n, tab };
  console.log(`\n######## ${basename(f)} (${R.regime}, n ${R.n})`);
  for (const [g, byF] of Object.entries(tab)) for (const [fk, rows] of Object.entries(byF)) {
    console.log(`== ${g} | surface ${fk} | scenes ${rows[0] ? rows[0].beatsCube.split('/')[1] ?? '' : ''}`);
    console.log('  place          sym     m2s     s2m     bias    vtx     m2sP95  s2mP95  beatsCube');
    for (const r of rows) console.log(`  ${r.place.padEnd(13)} ${r.sym.toFixed(4)}  ${r.m2s.toFixed(4)}  ${r.s2m.toFixed(4)}  ${r.bias.toFixed(4).padStart(7)}  ${r.vtx.toFixed(4)}  ${r.m2sP95.toFixed(3)}   ${r.s2mP95.toFixed(3)}   ${r.beatsCube}`);
  }
}
mkdirSync(new URL('../res/agg/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../res/agg/agg-${Date.now()}.json`, import.meta.url), JSON.stringify(out));
