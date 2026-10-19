// vmv: a 1-wide stone path painted on hinted grass along the FOOT of a built
// step or wall of height h (1–4) and thickness t. Plan zoom (topmost surface,
// triangle edges) hints | mv-quad, and the stone area shown on the step/wall
// TOP (x ≥ 16), where nothing but the step's own material was placed.
import { join } from 'node:path';
import { core, flatGround, GROUND, loadApproach, plan, zoomRgb, hcat, vcat, save, ROOT } from './vlib.mjs';
const { GRASS, STONE, PLANKS, BRICK, SAND } = core;
const CASES = [
  ['1-high grass step', 1, GRASS, 99], ['2-high grass step', 2, GRASS, 99], ['3-high grass step', 3, GRASS, 99], ['4-high grass step', 4, GRASS, 99],
  ['2-high planks wall, 1 thick', 2, PLANKS, 1], ['3-high planks wall, 1 thick', 3, PLANKS, 1], ['2-high brick wall, 3 thick', 2, BRICK, 3], ['3-high brick wall, 3 thick', 3, BRICK, 3],
  ['2-high sand step', 2, SAND, 99],
];
const rows = [];
for (const [label, h, mat, thick] of CASES) {
  const g = flatGround((x, z) => (x === 15 && z >= 6 && z < 26 ? STONE : GRASS));
  const cell = (x, y, z) => (y >= GROUND && y < GROUND + h && x >= 16 && x < 16 + thick ? { v: mat, edited: true } : g(x, y, z));
  const row = [], out = [];
  for (const p of ['approaches/hints.mjs', 'approaches/mv-quad.mjs']) {
    const A = await loadApproach(p);
    const { m, img } = plan(A, cell, [12, 3, 21, 29], 40);
    // stone shown on the step / wall top: samples x ≥ 16.5 whose topmost surface is above the ground level
    let onTop = 0;
    for (let j = 0; j < img.H; j++) for (let i = 0; i < img.W; i++) {
      const k = j * img.W + i, x = img.x0 + (i + 0.5) / img.S;
      if (x >= 16.5 && img.top[k] > GROUND + 0.5 && img.mat[k] === STONE) onTop++;
    }
    out.push(`${A.name} stone on the top ${(onTop / (img.S * img.S)).toFixed(2)} blocks²`);
    row.push(zoomRgb(img, m));
  }
  console.log(`${label}: ${out.join(' | ')}`);
  rows.push(hcat(row, 6));
}
save(join(ROOT, 'out', 'vmv-adv', 'cliff-leak.png'), hcat(rows, 14));
