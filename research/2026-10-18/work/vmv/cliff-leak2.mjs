// vmv: 2-high built grass step (x ≥ 16) with a 1-wide stone path (a) at its
// foot (x = 15, ground level) and (b) along its top edge (x = 16, top level).
// Plan zoom with triangle edges and a perspective view, hints | mv-quad.
import { join } from 'node:path';
import { core, flatGround, GROUND, loadApproach, plan, zoomRgb, renderShaded, frag, hcat, vcat, save, ROOT } from './vlib.mjs';
const { GRASS, STONE } = core;
const H = 2;
const foot = (() => { const g = flatGround((x, z) => (x === 15 && z >= 6 && z < 26 ? STONE : GRASS)); return (x, y, z) => (y >= GROUND && y < GROUND + H && x >= 16 ? { v: GRASS, edited: true } : g(x, y, z)); })();
const top = (() => { const g = flatGround(() => GRASS); return (x, y, z) => (y >= GROUND && y < GROUND + H && x >= 16 ? { v: y === GROUND + H - 1 && x === 16 && z >= 6 && z < 26 ? STONE : GRASS, edited: true } : g(x, y, z)); })();
const rows = [];
for (const [label, cell] of [['path at foot', foot], ['path on top edge', top]]) {
  const row = [];
  for (const p of ['approaches/hints.mjs', 'approaches/mv-quad.mjs']) {
    const A = await loadApproach(p);
    const { m, img } = plan(A, cell, [12, 2, 21, 11], 56);
    row.push(zoomRgb(img, m));
  }
  for (const p of ['approaches/hints.mjs', 'approaches/mv-quad.mjs']) {
    const A = await loadApproach(p);
    const m = A.mesh(core.buildRegion(cell, A.apron ?? 10), null, core);
    row.push(renderShaded(m, { width: 504, height: 504, eye: [10.5, GROUND + 7.5, 1.5], target: [16, GROUND + 1, 10], fragment: frag(A) }));
  }
  rows.push(hcat(row, 8));
}
save(join(ROOT, 'out', 'vmv-adv', 'cliff-leak-2high.png'), vcat(rows, 8));
