// Diagnostic: where does the hints rule's outline jaggedness come from?
// Vary the D-3 caps and k on the outline / curve scenes.
import * as core from '../../harness/core.mjs';
import { GEOMETRY_SCENES, CONSTRAINT_SCENES, BASE } from '../../harness/scenes.mjs';
import { geometryMetrics, constraintMetrics } from '../../harness/metrics.mjs';
const names = ['terrace-disc', 'terrace-1:2', 'tower-r4.6', 'mound-r6.4', 'pit-r5.4', 'ramp-1:4'];
const variants = {
  hints: {},
  nocaps: { capHorizontal: 0.5, capVertical: 0.5 },
  k20: { k: 20 },
  k20nocaps: { k: 20, capHorizontal: 0.5, capVertical: 0.5 },
};
const f = (v) => v.toFixed(3);
for (const s of [...GEOMETRY_SCENES, ...CONSTRAINT_SCENES]) {
  if (!names.includes(s.name) && s.kind !== 'constraint') continue;
  const region = core.buildRegion(s.cell, 10);
  const row = [s.name.padEnd(16)];
  for (const [k, p] of Object.entries(variants)) {
    const m = core.decodeMesh(core.meshRegion({ ...region, params: p }));
    if (s.kind === 'constraint') { const c = constraintMetrics(m, s, BASE); row.push(`${k}: ${c.pass ? 'ok' : 'FAIL'} ${f(c.value)}`); continue; }
    const g = geometryMetrics(m, s);
    if (g.outline) row.push(`${k}: ${f(g.outline.std)}/${f(g.outline.maxDev)} off ${f(g.outline.mean)}`);
    else row.push(`${k}: ${g.shadingNormal.rms.toFixed(1)}°/${g.shadingNormal.max.toFixed(1)}° face ${g.faceNormal.rms.toFixed(1)}° pos ${f(g.position.std)}`);
  }
  console.log(row.join(' | '));
}
