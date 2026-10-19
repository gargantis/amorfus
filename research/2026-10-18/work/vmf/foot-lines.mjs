// vmf: a 1-wide stone line on hinted grass running along the FOOT of a built
// step / wall (the commonest real case: a path along a house wall, a border
// at a terrace foot). Plan view of the lower level; stone parts and area.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { flatGround, GROUND } from './adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, matStats, hcat, vcat, save, renderShaded, ROOT } from './lib.mjs';
const { GRASS, STONE, PLANKS, BRICK } = core;
const CASES = {
  'foot of 1-high grass step': { h: 1, mat: GRASS, line: 15 },
  'one block off the 1-high step': { h: 1, mat: GRASS, line: 14 },
  'foot of 2-high grass step': { h: 2, mat: GRASS, line: 15 },
  'foot of 3-high planks wall (1 thick)': { h: 3, mat: PLANKS, line: 15, thick: 1 },
  'foot of 3-high brick wall (3 thick)': { h: 3, mat: BRICK, line: 15, thick: 3 },
  'plain line, no step (control)': { h: 0, mat: GRASS, line: 15 },
};
const apps = [await loadApproach('approaches/hints.mjs'), await loadApproach('approaches/mf-iso.mjs')];
const rows = [];
for (const [label, c] of Object.entries(CASES)) {
  const g = flatGround((x, z) => (x === c.line && z >= 6 && z < 26 ? STONE : GRASS));
  const cell = (x, y, z) => (y >= GROUND && y < GROUND + c.h && x >= 16 && x < 16 + (c.thick ?? 99) ? { v: c.mat, edited: true } : g(x, y, z));
  const out = [], imgs = [];
  for (const A of apps) {
    const m = A.mesh(core.buildRegion(cell, 10), null, core);
    const frag = A.fragment ? (a, i) => A.fragment(a, i, null) : null;
    const img = planRaster(m, { x0: c.line - 2, z0: 4, w: 4, h: 24, S: 32, fragment: frag });
    const st = matStats(img, [c.line - 1, 7, c.line + 2, 25]);
    out.push(`${A.name}: stone parts ${st.parts[STONE]}, area ${st.area[STONE].toFixed(1)} (18 placed)`);
    imgs.push(renderShaded(m, { width: 360, height: 240, eye: [c.line - 4.5, GROUND + 3.2, 27], target: [c.line + 0.5, GROUND, 14], fragment: frag }));
  }
  console.log(`${label}: ${out.join(' | ')}`);
  rows.push(hcat(imgs, 4));
}
save(join(ROOT, 'out', 'vmf-adv', 'foot-lines.png'), vcat(rows, 4));
