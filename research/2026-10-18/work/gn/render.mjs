// Render scenes and bench terrain views for gn variants into work/gn/img/<variant>/.
//   node work/gn/render.mjs <set> <variant,...> <scene,...|terrain>
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { meshRegion } from './mesher-gn.mjs';
import { SETS } from './variants.mjs';
import { mkdirSync } from 'node:fs';
const [set, vlist, slist] = process.argv.slice(2);
const VIEWS = {
  'terrain-mountain': { chunk: [-1, 1, 1], eye: [44, 40, 44], target: [14, 14, 14] },
  'terrain-beach': { chunk: [0, 0, -3], eye: [40, 34, 42], target: [15, 18, 15] },
};
for (const vn of vlist.split(',')) {
  const params = SETS[set][vn];
  const flat = params.rule === 'bevel' && params.faceted !== false;
  mkdirSync(`work/gn/img/${vn}`, { recursive: true });
  for (const sn of slist.split(',')) {
    if (sn === 'terrain') {
      for (const [label, v] of Object.entries(VIEWS)) {
        const inp = buildGenMeshInput([1, 1], ...v.chunk, new Map(), { forceApron: 12 }).input;
        const m = core.decodeMesh(meshRegion({ ...inp, params }));
        const img = renderShaded(m, { width: 560, height: 380, eye: v.eye, target: v.target });
        writePng(`work/gn/img/${vn}/${label}.png`, img.width, img.height, img.rgb);
      }
      continue;
    }
    const s = ALL_SCENES.find((x) => x.name === sn);
    const m = core.decodeMesh(meshRegion({ ...core.buildRegion(s.cell, 12), params }));
    if (process.env.NOAO) m.ao.fill(1);
    const img = renderShaded(m, { ...s.camera });
    writePng(`work/gn/img/${vn}/${sn}${process.env.NOAO ? '-noao' : ''}.png`, img.width, img.height, img.rgb);
  }
}
