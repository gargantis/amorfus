import { evaluate, line } from './eval.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
for (const [n, va] of [['k6 G1 sym', { k: 6, guard: G1 }], ['k6 G1 hAir .25', { k: 6, guard: G1, hAir: 0.25 }], ['k6 G1 hAir .15', { k: 6, guard: G1, hAir: 0.15 }], ['k6 G1 hAir 0', { k: 6, guard: G1, hAir: 0 }]])
  console.log(line(n, evaluate(va)));
