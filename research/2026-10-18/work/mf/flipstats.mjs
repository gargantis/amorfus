import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { build } from './field.mjs';
import { regionFor } from './sweep.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const cfg = JSON.parse(process.argv[2]);
const A = build(cfg);
for (const s of MATERIAL_SCENES.filter((s) => ['hill-materials', 'disc-r4.3', 'edge-1:2'].includes(s.name))) {
  const m = A.mesh(regionFor(s, 10), null, core);
  console.log(s.name, JSON.stringify(m.mfStats));
}
for (const c of [[-1, 1, 1], [0, 0, -3], [0, 0, 0], [1, 1, 1]]) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const m = A.mesh(inp, null, core);
  console.log('terrain', c.join(','), JSON.stringify(m.mfStats), 'quads', m.quadCount);
}
