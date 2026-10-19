// vmv: copy of work/vmf/pairs-img.mjs retargeted to hints | mf-iso | mv-quad, output to out/vmv-adv.
// vmf: pairs figure — top row hints, bottom row mf-iso: lone dot, two dots 2 / 3 / 4 apart, 2×2 dots 2 apart.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { flatGround } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, hcat, vcat, save, ROOT } from '../vmf/lib.mjs';
const { GRASS, STONE } = core;
const CASES = [[[16, 16]], [[14, 16], [16, 16]], [[14, 16], [17, 16]], [[13, 16], [17, 16]], [[14, 14], [16, 14], [14, 16], [16, 16]]];
const rows = [];
for (const p of ['approaches/hints.mjs', 'approaches/mf-iso.mjs', 'approaches/mv-quad.mjs']) {
  const A = await loadApproach(p);
  const row = [];
  for (const cells of CASES) {
    const set = new Set(cells.map(([x, z]) => `${x},${z}`));
    const plan = (x, z) => (set.has(`${x},${z}`) ? STONE : GRASS);
    const m = A.mesh(core.buildRegion(flatGround(plan), A.apron ?? 10), null, core);
    row.push(planRgb(planRaster(m, { x0: 11.5, z0: 12, w: 8, h: 7, S: 36, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null })));
  }
  rows.push(hcat(row, 6));
}
save(join(ROOT, 'out', 'vmv-adv', 'pairs-hints-mf-iso-mv-quad.png'), vcat(rows, 6));
