// Offline evaluation of any class table against the stored reference
// vertices of every scene set (ref error = |table vertex - vref|; an upper
// bound of the distance to the surface).  node src/evaltab.mjs > logs/evaltab.log
// Composite tables: '+mat' = entries of the 'mat' semantics (every block of
// one material one bubble) for classes with a same-material diagonal
// contact, the 'clu' table elsewhere.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { symPointInv } from './lattice.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const stats = (arr) => {
  const a = arr.filter(Number.isFinite).sort((p, q) => p - q);
  if (!a.length) return null;
  const q = (f) => a[Math.min(a.length - 1, Math.floor(f * a.length))];
  return { n: a.length, mean: +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(4), p50: +q(0.5).toFixed(4), p90: +q(0.9).toFixed(4), p99: +q(0.99).toFixed(4), max: +a[a.length - 1].toFixed(4) };
};
const fmt = (s) => (s ? `mean ${s.mean.toFixed(3)} p50 ${s.p50.toFixed(3)} p90 ${s.p90.toFixed(3)} p99 ${s.p99.toFixed(3)} (n ${s.n})` : '-');
const ent = (f) => (existsSync(`${ROOT}res/table/${f}.json`) ? JSON.parse(readFileSync(`${ROOT}res/table/${f}.json`, 'utf8')).entries : null);
const vOf = (e) => (e && e.vsn ? (e.vseam && e.seamInCell ? e.vseam : e.vsn) : null);
const out = {};
for (const reg of ['FID-0.15', 'FINITE-4']) {
  const T = {};
  for (const f of readdirSync(ROOT + 'res/table')) if (f.startsWith(reg + '_')) T[f.slice(reg.length + 1, -5)] = ent(f.slice(0, -5));
  const tables = {
    'E2c volume (clu)': (c) => vOf(T['E2c_n12_clu'][c]),
    'E2c volume +mat': (c) => vOf((T['E2c_n12_mat'] ?? {})[c] ?? T['E2c_n12_clu'][c]),
    'E2c no-volume (clu)': (c) => vOf(T['E2c_n12_clu-novol'][c]),
    'E2c no-volume +mat': (c) => vOf((T['E2c_n12_mat-novol'] ?? {})[c] ?? T['E2c_n12_clu-novol'][c]),
    'E1m (8 blocks alone)': (c) => vOf(T['E1m_n12_clu'][c]),
  };
  const K8 = JSON.parse(readFileSync(`${ROOT}res/table-K8-terrain-${reg}.json`, 'utf8')).entries;
  tables['terrain K8 (in-sample for terrain)'] = (c) => (K8[c] ? K8[c].v : null);
  for (const [set, file, pick] of [['terrain-random', 'terrain', (nm) => /^t\d+[ab]$/.test(nm)], ['terrain-seam', 'terrain', (nm) => /^t\d+s$/.test(nm)],
    ['builds', 'builds', () => true], ['cat', 'cat', () => true]]) {
    const p = `${ROOT}res/scenes/${file}_${reg}_n12.json`;
    if (!existsSync(p)) continue;
    const S = JSON.parse(readFileSync(p, 'utf8'));
    const cs = Object.entries(S.scenes).filter(([nm]) => pick(nm)).flatMap(([, sc]) => sc.corners).filter((c) => c.vref);
    console.log(`\n== ${set} ${reg}: ${cs.length} corners (${cs.filter((c) => c.seamIn > 0).length} with a seam in the cell)`);
    for (const [tn, f] of Object.entries(tables)) {
      const all = [], seam = [];
      let cov = 0;
      for (const c of cs) {
        const v = f(c.cls);
        if (!v) continue;
        cov++;
        const e = d3(symPointInv(c.g, v), c.vref);
        all.push(e); if (c.seamIn > 0) seam.push(e);
      }
      out[`${reg}|${set}|${tn}`] = { coverage: +(cov / cs.length).toFixed(4), ref: stats(all), refSeam: stats(seam) };
      console.log(`  ${tn.padEnd(36)} cover ${(100 * cov / cs.length).toFixed(1)}%  ref ${fmt(stats(all))}  | seam corners ${fmt(stats(seam))}`);
    }
    for (const base of ['blocks', 'bevel']) {
      const all = cs.map((c) => c.err?.[base]?.[1]), seam = cs.filter((c) => c.seamIn > 0).map((c) => c.err?.[base]?.[1]);
      out[`${reg}|${set}|${base}`] = { ref: stats(all), refSeam: stats(seam) };
      console.log(`  ${base.padEnd(36)} cover 100.0%  ref ${fmt(stats(all))}  | seam corners ${fmt(stats(seam))}`);
    }
  }
}
writeFileSync(ROOT + 'res/evaltab.json', JSON.stringify(out));
