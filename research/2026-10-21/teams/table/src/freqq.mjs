// Break down the non-Plateau terrain corners by class (reads res/freq.json).
import { readFileSync } from 'node:fs';
const F = JSON.parse(readFileSync(new URL('../res/freq.json', import.meta.url)));
const CL = JSON.parse(readFileSync(new URL('../res/classes.json', import.meta.url))).classes;
for (const s of ['bench16', 'wide', 'buildsAll']) {
  const h = F[s].surface; const tot = h.total;
  console.log(`== ${s} surface corners ${tot}`);
  const np = h.hist.filter(([c]) => !CL[c].plateau);
  const by = {};
  for (const [c, n] of np) { const k = `${CL[c].nMat}mat ${CL[c].xEdges ? 'X' : ''}${CL[c].x4Distinct ? '4' : ''} ${CL[c].ambUnion ? (CL[c].ambEdge ? 'ambE' : 'ambV') : ''} ${CL[c].over4Clu ? '>4clu' : ''} ${CL[c].airSplit ? 'airSplit' : ''}`; by[k] = (by[k] ?? 0) + n; }
  for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(36)} ${n} (${(100 * n / tot).toFixed(3)}%)`);
  console.log('  top non-Plateau classes: ' + np.slice(0, 10).map(([c, n]) => `${c}:${CL[c].key}:${(100 * n / tot).toFixed(3)}%`).join(' '));
  // ambiguous union split by material count
  const amb1 = h.hist.filter(([c]) => CL[c].ambUnion && CL[c].nMat === 1).reduce((s, [, n]) => s + n, 0);
  const ambM = h.hist.filter(([c]) => CL[c].ambUnion && CL[c].nMat >= 2).reduce((s, [, n]) => s + n, 0);
  console.log(`  ambiguous union: single-material ${amb1} (${(100 * amb1 / tot).toFixed(3)}%), multi-material ${ambM} (${(100 * ambM / tot).toFixed(3)}%)`);
  const xs1 = h.hist.filter(([c]) => CL[c].xEdges && !CL[c].ambUnion).reduce((s, [, n]) => s + n, 0);
  console.log(`  X-edge without solid ambiguous union (air diagonal or 4 distinct): ${xs1} (${(100 * xs1 / tot).toFixed(3)}%)`);
}
