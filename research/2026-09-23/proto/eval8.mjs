import { evaluate, line } from './eval.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
for (const [n, va] of [
  ['FINAL binary-fallback k6 G1 hAir.2', { k: 6, guard: G1, hAir: 0.2 }],
  ['FINAL binary-fallback k8 G1 hAir.2', { k: 8, guard: G1, hAir: 0.2 }],
  ['k4 G1 hAir.2', { k: 4, guard: G1, hAir: 0.2 }],
]) console.log(line(n, evaluate(va)));
