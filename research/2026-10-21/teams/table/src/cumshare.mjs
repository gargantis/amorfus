// Cumulative share of the most frequent surface classes (res/freq.json).
import { readFileSync } from 'node:fs';
const F = JSON.parse(readFileSync(new URL('../res/freq.json', import.meta.url)));
const CL = JSON.parse(readFileSync(new URL('../res/classes.json', import.meta.url))).classes;
for (const s of ['bench16', 'wide', 'buildsAll']) {
  const h = F[s].surface; let acc = 0;
  const rows = h.hist.slice(0, 12).map(([c, n], i) => { acc += n; return `${i + 1}:c${c} ${CL[c].key} ${(100 * n / h.total).toFixed(2)}% cum ${(100 * acc / h.total).toFixed(2)}%`; });
  console.log(`== ${s} (${h.total} surface corners)\n  ` + rows.join('\n  '));
  const single = h.hist.filter(([c]) => CL[c].nMat === 1).reduce((a, [, n]) => a + n, 0);
  const singleClasses = h.hist.filter(([c]) => CL[c].nMat === 1).length;
  console.log(`  single-material corners ${(100 * single / h.total).toFixed(2)}% in ${singleClasses} classes (of the 20 single-material surface classes)`);
}
