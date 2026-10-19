// vmf: perspective close-ups of 1-wide stone lines painted on the curved generated hill.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { sceneByName } from './adv-scenes.mjs';
import { loadApproach, renderShaded, hcat, vcat, save, ROOT } from './lib.mjs';
const apps = [await loadApproach('approaches/hints.mjs'), await loadApproach('approaches/mf-iso.mjs')];
const rows = [];
for (const [n, eye, tgt] of [['hill-line1-1:1', [22, 18.5, 10], [14, 12.5, 15]], ['hill-line1-1:2', [24, 17.5, 22], [16, 12.5, 15]], ['hill-line1-1:1', [6, 16, 25], [13, 13, 14]]]) {
  const sc = sceneByName(n);
  const row = [];
  for (const A of apps) {
    const m = A.mesh(core.buildRegion(sc.cell, A.apron ?? 10), null, core);
    row.push(renderShaded(m, { width: 480, height: 300, eye, target: tgt, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null }));
  }
  rows.push(hcat(row, 4));
}
save(join(ROOT, 'out', 'vmf-adv', 'hill-lines-close.png'), vcat(rows, 4));
