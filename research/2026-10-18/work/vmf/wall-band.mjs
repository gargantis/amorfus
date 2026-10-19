// vmf: close-up of the 1-high planks band near the top of the brick wall
// (wall-stripes scene) and of the stripe feet at the wall base.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { sceneByName, GROUND } from './adv-scenes.mjs';
import { loadApproach, renderShaded, hcat, vcat, save, ROOT } from './lib.mjs';
const sc = sceneByName('wall-stripes');
const apps = [await loadApproach('approaches/hints.mjs'), await loadApproach('approaches/mf-iso.mjs')];
const rows = [];
for (const [eye, tgt] of [[[18, GROUND + 8.5, 8.5], [18, GROUND + 8.3, 16]], [[12, GROUND + 1.5, 9], [10, GROUND + 0.8, 16]]]) {
  const row = [];
  for (const A of apps) {
    const m = A.mesh(core.buildRegion(sc.cell, 10), null, core);
    row.push(renderShaded(m, { width: 480, height: 300, eye, target: tgt, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null }));
  }
  rows.push(hcat(row, 4));
}
save(join(ROOT, 'out', 'vmf-adv', 'wall-band-close.png'), vcat(rows, 4));
