// vmf: one sheet of the main failures, each pair = hints (left) | mf-iso (right), plan view.
// Row 1: 1:1 diagonal stripes gap 2 · 25% dot dither · 16×16 checker
// Row 2: 1-wide X crossing · ladder (rails + rungs) · pixel text "2068/BEAM/RS#4"
// Row 3: 1-wide stone line at the foot of a 1-high grass step · 1:2 line on the generated hill · two dots 2 apart
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { sceneByName, flatGround, GROUND } from './adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, hcat, vcat, save, ROOT } from './lib.mjs';
const { GRASS, STONE } = core;
const apps = [await loadApproach('approaches/hints.mjs'), await loadApproach('approaches/mf-iso.mjs')];
const ladder = flatGround((x, z) => ((z === 14 || z === 17 ? x >= 6 && x < 26 : z > 14 && z < 17 && x >= 6 && x < 26 && x % 2 === 0) ? STONE : GRASS));
const footG = flatGround((x, z) => (x === 15 && z >= 6 && z < 26 ? STONE : GRASS));
const foot = (x, y, z) => (y === GROUND && x >= 16 ? { v: GRASS, edited: true } : footG(x, y, z));
const pairs = flatGround((x, z) => ((z === 16 && (x === 14 || x === 16)) || (z === 10 && (x === 13 || x === 16)) || (z === 22 && (x === 12 || x === 16)) ? STONE : GRASS));
const items = [
  [sceneByName('stripes-d3').cell, [6, 6, 26, 26]], [sceneByName('dither-25').cell, [6, 6, 26, 26]], [sceneByName('checker16').cell, [6, 6, 26, 26]],
  [sceneByName('lines-X').cell, [6, 6, 26, 26]], [ladder, [6, 6, 26, 26]], [sceneByName('pixel-text').cell, [4, 3, 24, 23]],
  [foot, [6, 6, 26, 26]], [sceneByName('hill-line1-1:2').cell, [6, 6, 26, 26]], [pairs, [6, 6, 26, 26]],
];
const tiles = [];
for (const [cell, w] of items) {
  const pair = [];
  for (const A of apps) {
    const m = A.mesh(core.buildRegion(cell, 10), null, core);
    pair.push(planRgb(planRaster(m, { x0: w[0], z0: w[1], w: w[2] - w[0], h: w[3] - w[1], S: 14, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null })));
  }
  tiles.push(hcat(pair, 3));
}
save(join(ROOT, 'out', 'vmf-adv', 'sheet-failures.png'), vcat([hcat(tiles.slice(0, 3), 14), hcat(tiles.slice(3, 6), 14), hcat(tiles.slice(6, 9), 14)], 14));
