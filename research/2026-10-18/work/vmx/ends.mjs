// vmx: copy of work/vmf/ends.mjs (imports fixed, outputs redirected to out/vmx-adv and work/vmx, mx-codes added).
// vmf: zoomed plan views (triangle edges overlaid) of line ENDS and the
// step-foot dotted line, hints (left) vs mf-iso (right).
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { flatGround, sceneByName, GROUND } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, hcat, vcat, save, ROOT } from '../vmf/lib.mjs';
const { GRASS, STONE } = core;
const apps = [await loadApproach('approaches/hints.mjs'), await loadApproach('approaches/mf-iso.mjs'), await loadApproach('approaches/vmx-codes.mjs')];
const views = [
  ['diag line end', flatGround((x, z) => (x >= 5 && x < 27 && z === x ? STONE : GRASS)), [3, 3, 10, 10]],
  ['Xdiag end', sceneByName('lines-Xdiag').cell, [3, 3, 10, 10]],
  ['step-foot line', (() => { const g = flatGround((x, z) => (x === 15 && z >= 6 && z < 26 ? STONE : GRASS)); return (x, y, z) => (y === GROUND && x >= 16 ? { v: GRASS, edited: true } : g(x, y, z)); })(), [12, 12, 19, 19]],
];
const rows = [];
for (const [label, cell, w] of views) {
  const row = [];
  for (const A of apps) {
    const m = A.mesh(core.buildRegion(cell, 10), null, core);
    row.push(planRgb(planRaster(m, { x0: w[0], z0: w[1], w: w[2] - w[0], h: w[3] - w[1], S: 64, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null }), { edges: true }));
  }
  rows.push(hcat(row, 6));
}
save(join(ROOT, 'out', 'vmx-adv', 'zoom-ends-and-foot.png'), vcat(rows, 6));
