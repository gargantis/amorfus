// vmf: zoom (128 px/block, triangle edges) on 3- and 4-material junction centres.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { sceneByName } from './adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, hcat, vcat, save, ROOT } from './lib.mjs';
const A = await loadApproach('approaches/mf-iso.mjs');
const rows = [];
for (const [cell, w] of [[MATERIAL_SCENES.find((s) => s.name === 'junction3').cell, [14, 14, 19, 19]], [sceneByName('corner4-diag').cell, [13.5, 13.5, 18.5, 18.5]], [sceneByName('corner3-thin').cell, [13, 13, 18, 18]]]) {
  const m = A.mesh(core.buildRegion(cell, 6), null, core);
  rows.push(planRgb(planRaster(m, { x0: w[0], z0: w[1], w: w[2] - w[0], h: w[3] - w[1], S: 112, fragment: (a, i) => A.fragment(a, i, null) }), { edges: true }));
}
save(join(ROOT, 'out', 'vmf-adv', 'zoom-junctions.png'), hcat(rows, 6));
