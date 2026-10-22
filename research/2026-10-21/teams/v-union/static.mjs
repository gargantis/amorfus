// Static census: every X in each attack config with rule4 / size verdicts.
import { writeFileSync } from 'node:fs';
import { xList, swapAB } from './vu.mjs';
import * as K from './cfg-v.mjs';
const cfgs = {
  W1: K.to2(K.W1()), 'W1-swap': swapAB(K.to2(K.W1())), 'W1-bar2': K.to2(K.W1({ bar: 2 })),
  L2: K.to2(K.L2()), 'L2-swap': swapAB(K.to2(K.L2())), 'L2-shortA': K.to2(K.L2({ kA: [0, 1], tB: [-4, 5] })),
  'LX-6x6': K.to2(K.LX()), 'LX-8x2': K.to2(K.LX({ nA: 8, nB: 2 })), 'LX-10x4': K.to2(K.LX({ nA: 10, nB: 4 })),
  lineToBlob: K.to2(K.lineToBlob()), lineIntoChecker: K.to2(K.lineIntoChecker()),
  checkerSmallA: K.to2(K.checkerSmallA), diagEdge: K.to2(K.diagEdge),
};
const out = {};
for (const [name, b] of Object.entries(cfgs)) {
  const X = xList(b);
  out[name] = { blocks: b.length, phases: X.phases.length - 1, xs: X.xs.map((x) => ({ at: x.at.slice(0, 2), mats: x.pairs.map((p) => p.mat), sizes: x.pairs.map((p) => p.sizes), n: x.n, rule4: x.rule4, size: x.size })) };
  console.log(name, b.length, 'blocks', X.phases.length - 1, 'phases');
  for (const x of out[name].xs) console.log('   X', JSON.stringify(x));
}
writeFileSync(new URL('./res-static.json', import.meta.url), JSON.stringify(out, null, 1));
