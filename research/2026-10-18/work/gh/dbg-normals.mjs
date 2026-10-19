import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { contourCrossN } from './syn.mjs';
const name = process.argv[2];
const scene = ALL_SCENES.find((s) => s.name === name);
const region = core.buildRegion(scene.cell, 10);
const { crossT, crossN } = contourCrossN(region, { R: 8 });
const n = region.nx;
const errs = { 0: [], 1: [], 2: [] };
const samples = [];
for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
  const i = (y * n + z) * n + x;
  for (let a = 0; a < 3; a++) {
    const t = crossT[i * 3 + a];
    if (t < 0) continue;
    const N = [crossN[i * 9 + a * 3], crossN[i * 9 + a * 3 + 1], crossN[i * 9 + a * 3 + 2]];
    if (N[0] === 0 && N[1] === 0 && N[2] === 0) continue;
    const P = [x - 10 + 0.5 + (a === 0 ? t : 0), y - 10 + 0.5 + (a === 1 ? t : 0), z - 10 + 0.5 + (a === 2 ? t : 0)];
    if (scene.ideal.inWindow && !scene.ideal.inWindow(P)) continue;
    if (!scene.ideal.normal) continue;
    const I = scene.ideal.normal(P);
    const e = core.angleDeg(N[0], N[1], N[2], I[0], I[1], I[2]);
    errs[a].push(e);
    if (samples.length < 12 && e > 15) samples.push(`${'xyz'[a]} @${P.map((v) => v.toFixed(2))} N ${N.map((v) => v.toFixed(2))} ideal ${I.map((v) => v.toFixed(2))} err ${e.toFixed(1)}`);
  }
}
for (const a of [0, 1, 2]) { const s = core.stats(errs[a]); console.log('xyz'[a], 'n', s.n, 'rms', s.rms?.toFixed(1), 'max', s.maxAbs?.toFixed(1)); }
console.log(samples.join('\n'));
