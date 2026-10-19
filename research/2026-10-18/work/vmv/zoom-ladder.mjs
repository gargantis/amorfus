// vmv: zoom (80 px/block, triangle edges) on the left end of the 1-wide ladder
// (rails z = 14 and 17, rungs at even x), hints | mv-quad.
import { core, flatGround, loadApproach, plan, zoomRgb, hcat, vcat, save, ROOT, fidelity } from './vlib.mjs';
import { join } from 'node:path';
const { GRASS, STONE } = core;
const pf = (x, z) => ((z === 14 || z === 17 ? x >= 6 && x < 26 : z > 14 && z < 17 && x >= 6 && x < 26 && x % 2 === 0) ? STONE : GRASS);
const rows = [];
for (const win of [[4, 12, 13, 19], [19, 12, 28, 19]]) {
  const row = [];
  for (const p of ['approaches/hints.mjs', 'approaches/mv-quad.mjs']) {
    const A = await loadApproach(p);
    const { m, img } = plan(A, flatGround(pf), win, 80);
    const f = fidelity(img, pf, win);
    console.log(`${A.name} window ${win}: stone shown ${f.fgArea.toFixed(2)} of ${f.fgCells} painted, wrong ${f.wrong.toFixed(2)} blocks²`);
    row.push(zoomRgb(img, m));
  }
  rows.push(hcat(row, 8));
}
save(join(ROOT, 'out', 'vmv-adv', 'zoom-ladder.png'), vcat(rows, 8));
