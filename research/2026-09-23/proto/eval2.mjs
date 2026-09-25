import { evaluate, line } from './eval.mjs';
import { meshChunk, AMBIG } from './sn.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
const G3 = [0.2, 0.2, 0.25, 0.5, 0.5, 0.5, 0.5];
for (const [n, va] of [['k6 G1', { k: 6, guard: G1 }], ['k6 G1 pinAmbig', { k: 6, guard: G1, pinAmbiguous: true }], ['k8 G3', { k: 8, guard: G3 }], ['k8 G3 pinAmbig', { k: 8, guard: G3, pinAmbiguous: true }]])
  console.log(line(n, evaluate(va)));
