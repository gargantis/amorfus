// Task 3c: chunk-seam agreement of the bubble vertex rule. Adjacent chunks
// are meshed from their own 38^3 regions; corners on the shared plane must
// get identical (quantised) offsets.   node t3seam.mjs <out.json>
import { writeFileSync, readFileSync } from 'node:fs';
import { buildGenMeshInput } from './repo-bundle.mjs';
import { makeRule, bubbleVertices } from './vrule.mjs';
const [out] = process.argv.slice(2);
const L20 = JSON.parse(readFileSync(new URL('../res/fitlam-g20.json', import.meta.url), 'utf8')).best;
const rules = { 'bub-b1-local': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 } }), 'bub-b3-local': makeRule({ kernel: 'b3', sigma: 0.2, lambda: { local: L20 } }) };
const pairs = [[[0, 0, 0], [1, 0, 0]], [[0, 0, 0], [0, 0, 1]], [[-2, 1, 1], [-1, 1, 1]], [[-2, 0, 1], [-2, 1, 1]], [[-2, -1, 1], [-2, -1, 2]]];
const res = { pairs: [] };
for (const [a, b] of pairs) {
  const ax = b.findIndex((v, t) => v !== a[t]); // axis along which they touch (b = a + 1)
  for (const [id, rule] of Object.entries(rules)) {
    const run = (c) => { const { input } = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map()); const r = bubbleVertices(input.blocks, 38, 38, 38, 3, rule); const m = new Map(); for (let v = 0; v < r.count; v++) { const w = [0, 1, 2].map((t) => r.corner[v * 3 + t] - 3 + c[t] * 32); m.set(w.join(','), [r.off[v * 3], r.off[v * 3 + 1], r.off[v * 3 + 2]]); } return m; };
    const A = run(a), B = run(b);
    let shared = 0, mism = 0, maxd = 0;
    const plane = b[ax] * 32;
    for (const [k, o] of A) {
      const w = k.split(',').map(Number);
      if (w[ax] !== plane) continue;
      const q = B.get(k);
      if (!q) { mism++; continue; }
      shared++;
      const d = Math.max(...o.map((v, t) => Math.abs(v - q[t])));
      if (d > 0) mism++;
      maxd = Math.max(maxd, d);
    }
    res.pairs.push({ a, b, rule: id, sharedCorners: shared, mismatches: mism, maxAbsDiff: maxd });
    console.log(id, a.join(','), '|', b.join(','), 'shared', shared, 'mismatches', mism, 'maxdiff', maxd);
  }
}
writeFileSync(out, JSON.stringify(res, null, 1));
