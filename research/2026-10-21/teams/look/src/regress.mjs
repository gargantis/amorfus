// The engine copy must reproduce lib/mbo.mjs label-for-label when its additions are off.
import { simulate as A } from '../../../lib/mbo.mjs';
import { simulate as B } from './mbo-look.mjs';
import { byName } from '../../../lib/configs.mjs';
const cases = [['cube2-same', { anchor: { kind: 'fidelity', k: 0.15 } }], ['slab-line', { anchor: { kind: 'fidelity', k: 0.1 } }],
  ['pair-diff', { anchor: { kind: 'cage', r: 0.25 } }], ['L3-ABC', { maxSteps: 4, stopAfter: 99 }], ['stairs', { maxSteps: 300 }],
  ['slab-dot', { anchor: { kind: 'fidelity', k: 0.15, kMat: 0.15 } }]];
for (const [name, o] of cases) {
  const a = A(byName(name).blocks, o), b = B(byName(name).blocks, o);
  let diff = 0; for (let c = 0; c < a.N; c++) if (a.label[c] !== b.label[c]) diff++;
  let dD = 0; for (let c = 0; c < a.N; c++) dD = Math.max(dD, Math.abs(a.D[c] - b.D[c]));
  console.log(name, JSON.stringify(o), 'steps', a.steps, b.steps, 'label diffs', diff, 'max |ΔD|', dD);
}
