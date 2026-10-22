// Newton-iteration convergence of the b1 vertex rule: offsets after k
// iterations vs 16 iterations, over the catalogue and one cave chunk.
import { writeFileSync, readFileSync } from 'node:fs';
import { CONFIGS } from '../../../lib/configs.mjs';
import { buildGenMeshInput } from './repo-bundle.mjs';
import { makeRule, bubbleVertices } from './vrule.mjs';
import { regionOf } from './t3acc.mjs';
const [out] = process.argv.slice(2);
const L20 = JSON.parse(readFileSync(new URL('../res/fitlam-g20.json', import.meta.url), 'utf8')).best;
const regions = CONFIGS.map((c) => [c.name, regionOf(c.blocks)]);
for (const c of [[-2, -1, 1], [-2, 1, 1], [0, 0, 0]]) regions.push([`chunk ${c.join(',')}`, buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map()).input.blocks]);
const res = {};
for (const kernel of ['b1', 'b3']) {
  const ref = makeRule({ kernel, sigma: 0.2, lambda: { local: L20 }, iters: 16 });
  for (const k of [1, 2, 3, 4, 6]) {
    const rule = makeRule({ kernel, sigma: 0.2, lambda: { local: L20 }, iters: k });
    let n = 0, maxd = 0, sum = 0, over = 0;
    for (const [, reg] of regions) {
      const A = bubbleVertices(reg, 38, 38, 38, 3, rule), B = bubbleVertices(reg, 38, 38, 38, 3, ref);
      for (let i = 0; i < A.count; i++) { const d = Math.max(...[0, 1, 2].map((t) => Math.abs(A.off[i * 3 + t] - B.off[i * 3 + t]))); maxd = Math.max(maxd, d); sum += d; n++; if (d > 1 / 256 + 1e-9) over++; }
    }
    res[`${kernel}-${k}`] = { corners: n, meanMaxAxisDiff: +(sum / n).toExponential(3), maxAxisDiff: +maxd.toFixed(4), cornersOffByMoreThanOneQuantum: over };
    console.log(kernel, k, JSON.stringify(res[`${kernel}-${k}`]));
  }
}
writeFileSync(out, JSON.stringify(res, null, 1));
