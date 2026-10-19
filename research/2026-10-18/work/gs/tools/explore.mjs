// Explore GS param sets on the geometry + constraint scenes.
//   node work/gs/tools/explore.mjs '<label>' '<json params>' ['<label>' '<json>' ...]
import * as core from '../../../harness/core.mjs';
import { GEOMETRY_SCENES, CONSTRAINT_SCENES, BASE } from '../../../harness/scenes.mjs';
import { geometryMetrics, constraintMetrics } from '../../../harness/metrics.mjs';
import { meshRegion } from '../mesher-gs.mjs';
const args = process.argv.slice(2);
const sets = [];
for (let i = 0; i < args.length; i += 2) sets.push([args[i], JSON.parse(args[i + 1])]);
const scenes = [...GEOMETRY_SCENES, ...CONSTRAINT_SCENES];
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—');
const rows = {};
for (const [label, params] of sets) {
  let ms = 0;
  for (const s of scenes) {
    const region = core.buildRegion(s.cell, 10);
    const t0 = performance.now();
    const m = meshRegion({ ...region, params });
    ms += performance.now() - t0;
    const mesh = core.decodeMesh(m);
    let cellTxt;
    if (s.kind === 'geometry') {
      const g = geometryMetrics(mesh, s);
      cellTxt = g.outline ? `${f3(g.outline.std)}/${f3(g.outline.maxDev)}` : `${f1(g.shadingNormal.rms)}/${f1(g.shadingNormal.max)} p${f3(g.position.mean)}`;
    } else {
      const c = constraintMetrics(mesh, s, BASE);
      cellTxt = `${c.pass ? 'ok' : 'FAIL'} ${f3(c.value)}`;
    }
    (rows[s.name] ??= []).push(cellTxt + (m.stats?.iters ? ` i${m.stats.iters}` : ''));
  }
  (rows['ms'] ??= []).push(ms.toFixed(0));
}
const w = 26;
console.log('scene'.padEnd(18) + sets.map(([l]) => l.padEnd(w)).join(''));
for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(18) + v.map((x) => x.padEnd(w)).join(''));
