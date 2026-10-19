// vmf: the "sharp opt-out" for crisp patterns on a curved hill: the same 1:2
// stone line painted as SHARP blocks (mf-iso keeps them one-hot) — what does
// the geometry do? Left: mf-iso smooth line; right: mf-iso sharp line.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { loadApproach, renderShaded, hcat, save, ROOT } from './lib.mjs';
const { AIR, GRASS, DIRT, STONE, SHARP_BIT } = core;
const hillH = (x, z) => 9 + 5 * Math.exp(-((x - 16) ** 2 + (z - 16) ** 2) / (2 * 5.5 ** 2));
const line = (x, z) => x >= 3 && x < 29 && z === Math.round(0.5 * (x + 0.5) + 8.3 - 0.5);
const cell = (sharp) => (x, y, z) => {
  const d = hillH(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  const top = line(x, z) ? (sharp ? STONE | SHARP_BIT : STONE) : GRASS;
  return { v: depth <= 1 ? top : depth <= 4 ? DIRT : STONE, rho: clampRho(d), edited: sharp && depth <= 1 && line(x, z) };
};
const A = await loadApproach('approaches/mf-iso.mjs');
const imgs = [];
for (const sharp of [false, true]) {
  const m = A.mesh(core.buildRegion(cell(sharp), 10), null, core);
  imgs.push(renderShaded(m, { width: 480, height: 320, eye: [24, 17.5, 22], target: [16, 12.5, 15], fragment: (a, i) => A.fragment(a, i, null) }));
}
save(join(ROOT, 'out', 'vmf-adv', 'sharp-optout-hill.png'), hcat(imgs, 4));
