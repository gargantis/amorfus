import * as core from '../../../harness/core.mjs';
import { GEOMETRY_SCENES } from '../../../harness/scenes.mjs';
import { meshRegion } from '../mesher-gs.mjs';
const params = JSON.parse(process.argv[2]);
for (const s of GEOMETRY_SCENES) {
  globalThis.__GS_RATIOS = [];
  meshRegion({ ...core.buildRegion(s.cell, 10), params });
  const r = globalThis.__GS_RATIOS.slice().sort((a, b) => a - b);
  if (!r.length) continue;
  const q = (f) => r[Math.min(r.length - 1, Math.floor(f * r.length))].toFixed(2);
  const hist = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.01].map((t, i, a) => r.filter((x) => x < t && x >= (i ? a[i - 1] : -1)).length);
  console.log(s.name.padEnd(18), `n ${r.length}  p10 ${q(0.1)} p25 ${q(0.25)} p50 ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)}  hist<.1,.2,.3,.4,.5,.6,.8,1: ${hist.join(' ')}`);
}
