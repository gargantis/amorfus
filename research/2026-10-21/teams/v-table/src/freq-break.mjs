// v-table: break down the non-Plateau terrain corners of res/freq/<label>.json
// by the kind of X edge, and the single-material corners by material
// context (needs a re-scan, so only the class-level breakdown is here).
//   node src/freq-break.mjs <label...>
import { readFileSync } from 'node:fs';

const RINGS = [];
for (let a = 0; a < 3; a++) for (let s = 0; s < 2; s++) {
  const [u, v] = [0, 1, 2].filter((t) => t !== a);
  RINGS.push([[0, 0], [1, 0], [1, 1], [0, 1]].map(([pu, pv]) => { const c = [0, 0, 0]; c[a] = s; c[u] = pu; c[v] = pv; return c[0] | (c[2] << 1) | (c[1] << 2); }));
}
function clusters(lab) {
  const cl = new Int8Array(8).fill(-1); let n = 0;
  for (let b = 0; b < 8; b++) {
    if (lab[b] === 0 || cl[b] >= 0) continue;
    const st = [b]; cl[b] = n;
    while (st.length) { const c = st.pop(); for (const bit of [1, 2, 4]) { const d = c ^ bit; if (cl[d] < 0 && lab[d] === lab[c]) { cl[d] = n; st.push(d); } } }
    n++;
  }
  return { cl, n };
}
function kinds(lab) {
  const { cl, n } = clusters(lab);
  const air = lab.includes(0);
  const mats = new Set(lab.filter((v) => v));
  let amb = false;
  for (const m of mats) { const s = new Set(); for (let b = 0; b < 8; b++) if (lab[b] === m) s.add(cl[b]); if (s.size > 1) amb = true; }
  const xk = new Set();
  for (const r of RINGS) {
    const L = r.map((b) => lab[b]);
    let films = 0; for (let i = 0; i < 4; i++) if (L[i] !== L[(i + 1) & 3]) films++;
    if (films !== 4) continue;
    const d1 = [L[0], L[2]], d2 = [L[1], L[3]];
    const same = (d) => d[0] === d[1];
    // kinds: solid-solid same material diagonal with air on the other (S-air-S-air)
    const tag = (d) => (d[0] === 0 && d[1] === 0 ? 'air' : same(d) ? 'mat' : 'diff');
    xk.add([tag(d1), tag(d2)].sort().join('/'));
  }
  return { amb, xk: [...xk].sort().join(','), over4: n + (air ? 1 : 0) > 4, nMat: mats.size };
}
for (const label of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(new URL(`../res/freq/${label}.json`, import.meta.url), 'utf8'));
  const tot = d.surface;
  const by = new Map();
  for (const [key, n] of d.hist) {
    const k = kinds(key.split('').map(Number));
    if (!k.amb && !k.xk && !k.over4) continue;
    const t = `${k.amb ? 'ambUnion' : 'noAmb'} | X:${k.xk || '-'} | over4:${k.over4} | nMat:${k.nMat}`;
    by.set(t, (by.get(t) ?? 0) + n);
  }
  console.log(`== ${label}: surface ${tot}`);
  for (const [t, n] of [...by.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${(100 * n / tot).toFixed(3)}%  ${t}`);
}
