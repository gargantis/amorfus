// quick metrics for one module over chosen scenes (no files written)
import * as core from '../../harness/core.mjs';
import { ALL_SCENES, BASE } from '../../harness/scenes.mjs';
import { geometryMetrics, constraintMetrics } from '../../harness/metrics.mjs';
import { tunnelCheck, pillarCheck } from './clearance.mjs';
const A = await import(new URL(process.argv[2], `file://${process.cwd()}/`).href);
const only = (process.argv[3] ?? 'terrace-disc,terrace-1:2,tower-r4.6,mound-r6.4,pit-r5.4,ramp-1:4,floating-block,pillar,tunnel-1x2').split(',');
const out = [];
for (const s of ALL_SCENES) {
  if (!only.includes(s.name)) continue;
  const m = A.mesh(core.buildRegion(s.cell, A.apron ?? 10), null, core);
  if (s.kind === 'geometry') {
    const g = geometryMetrics(m, s, { flatShading: A.flatShading === true });
    out.push(`${s.name} ${g.outline ? `${g.outline.std.toFixed(3)}/${g.outline.maxDev.toFixed(3)} off ${g.outline.mean.toFixed(3)}` : `${g.shadingNormal.rms.toFixed(1)}°/${g.shadingNormal.max.toFixed(1)}°`}`);
  } else if (s.kind === 'constraint') {
    const c = constraintMetrics(m, s, BASE);
    let extra = '';
    if (s.name === 'tunnel-1x2') extra = ` capsule ${tunnelCheck(m).capsuleClearance.toFixed(3)}`;
    if (s.name === 'pillar') extra = ` minW ${pillarCheck(m).minWidth.toFixed(3)}`;
    out.push(`${s.name} ${c.pass ? 'ok' : 'FAIL'} ${c.value.toFixed(3)}${extra}`);
  }
}
console.log(`${A.name}: ${out.join(' | ')}`);
