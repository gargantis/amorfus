// vmx: copy of work/vmf/pairs.mjs (imports fixed, outputs redirected to out/vmx-adv and work/vmx, mx-codes added).
// vmf: two lone stone blocks on grass at offset (dx,dz): do they stay two
// dots (as placed) or bridge into one blob across the grass gap? And a row of
// 3 dots spaced 2. Plan view, harness-equivalent raster.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { flatGround } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, matStats, hcat, save, ROOT } from '../vmf/lib.mjs';
const { GRASS, STONE } = core;
const A = await loadApproach(process.argv[2] ?? 'approaches/mf-iso.mjs');
const imgs = [];
const run = (label, cells) => {
  const set = new Set(cells.map(([x, z]) => `${x},${z}`));
  const plan = (x, z) => (set.has(`${x},${z}`) ? STONE : GRASS);
  const m = A.mesh(core.buildRegion(flatGround(plan), A.apron ?? 10), null, core);
  const img = planRaster(m, { x0: 11, z0: 11, w: 10, h: 10, S: 48, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
  const st = matStats(img, [11, 11, 21, 21]);
  console.log(`${label}: stone parts ${st.parts[STONE]} (placed ${cells.length} blocks, ${cells.length} separate), area ${st.area[STONE].toFixed(2)} blocks² (placed ${cells.length})`);
  imgs.push(planRgb(img));
};
run('single', [[16, 16]]);
for (const [dx, dz] of [[2, 0], [2, 1], [2, 2], [3, 0], [3, 1], [3, 3], [4, 0]]) run(`pair (${dx},${dz})`, [[15, 15], [15 + dx, 15 + dz]]);
run('row of 3, spacing 2', [[13, 16], [15, 16], [17, 16]]);
run('row of 4, spacing 2', [[12, 16], [14, 16], [16, 16], [18, 16]]);
run('2x2 dots spacing 2', [[14, 14], [16, 14], [14, 16], [16, 16]]);
save(join(ROOT, 'out', 'vmx-adv', `pairs-${A.name}.png`), hcat(imgs, 4));
