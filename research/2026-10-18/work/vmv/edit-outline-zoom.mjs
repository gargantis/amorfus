// vmv: the 7×7 outline drawn one block per step — steps 8 … 19 at 28 px/block,
// top row hints, bottom row mv-quad (window [10, 10, 21, 21]).
import { join } from 'node:path';
import { core, flatGround, loadApproach, plan, planRgb, hcat, vcat, save, ROOT } from './vlib.mjs';
const { GRASS, STONE } = core;
const c = []; for (let x = 12; x < 19; x++) c.push([x, 12]); for (let z = 13; z < 19; z++) c.push([18, z]); for (let x = 17; x >= 12; x--) c.push([x, 18]); for (let z = 17; z > 12; z--) c.push([12, z]);
const rows = [];
for (const p of ['approaches/hints.mjs', 'approaches/mv-quad.mjs']) {
  const A = await loadApproach(p);
  const row = [];
  for (const k of [8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 22]) {
    const set = new Set(c.slice(0, k).map(([x, z]) => `${x},${z}`));
    const { img } = plan(A, flatGround((x, z) => (set.has(`${x},${z}`) ? STONE : GRASS)), [10, 10, 21, 21], 28);
    row.push(planRgb(img));
  }
  rows.push(hcat(row, 6));
}
save(join(ROOT, 'out', 'vmv-adv', 'edit-outline-steps.png'), vcat(rows, 10));
