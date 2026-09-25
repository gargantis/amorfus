import { evaluate, line } from './eval.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
for (const [n, va] of [
  ['blur121 topo-binary k0', { init: 'blur', k: 0 }],
  ['blur14641 topo-binary k0', { init: 'blur', kernel: [1, 4, 6, 4, 1], k: 0 }],
  ['blur121 k2', { init: 'blur', k: 2 }],
  ['blur14641 k2', { init: 'blur', kernel: [1, 4, 6, 4, 1], k: 2 }],
  ['blur14641 k4 G1', { init: 'blur', kernel: [1, 4, 6, 4, 1], k: 4, guard: G1 }],
  ['REF corner k6 G1', { k: 6, guard: G1 }],
]) console.log(line(n, evaluate(va)));
