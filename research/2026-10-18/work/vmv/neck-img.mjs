// vmv: the 1:1 diagonal stone line (x = z, 4 ≤ x < 28) with ONE extra stone
// block (a diagonal spur) — plan zoom with triangle edges, hints | mv-quad,
// and the stone parts / min width along the line.
import { join } from 'node:path';
import { core, flatGround, loadApproach, plan, zoomRgb, matStats, hcat, vcat, save, ROOT } from './vlib.mjs';
const { GRASS, STONE } = core;
const S = 80, win = [11, 11, 20, 20];
const rows = [];
for (const [px, pz] of [[null, null], [15, 17], [17, 15], [14, 16], [16, 14], [18, 20]]) {
  const pf = (x, z) => (x === px && z === pz ? STONE : x >= 4 && x < 28 && z === x ? STONE : GRASS);
  const row = [];
  const out = [];
  for (const p of ['approaches/hints.mjs', 'approaches/mv-quad.mjs']) {
    const A = await loadApproach(p);
    const { m, img } = plan(A, flatGround(pf), win, S);
    const big = plan(A, flatGround(pf), [6, 6, 26, 26], 32).img;
    const st = matStats(big, [6, 6, 26, 26]);
    out.push(`${A.name} ${st.parts[STONE]} part(s), area ${st.area[STONE].toFixed(2)}`);
    row.push(zoomRgb(img, m));
  }
  console.log(`extra block ${px},${pz}: ${out.join(' | ')}`);
  rows.push(hcat(row, 8));
}
save(join(ROOT, 'out', 'vmv-adv', 'neck-spurs.png'), vcat([hcat(rows.slice(0, 3), 16), hcat(rows.slice(3), 16)], 16));
