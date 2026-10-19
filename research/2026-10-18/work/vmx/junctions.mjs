// vmx: copy of work/vmf/junctions.mjs (imports fixed, outputs redirected to out/vmx-adv and work/vmx, mx-codes added).
// vmf: junction variants of 1- and 2-wide painted paths on flat hinted grass.
// Reports stone (and sand) displayed parts; every shape below is ONE
// connected path in the blocks (4-connected), so the right answer is 1 part.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { flatGround } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, matStats, hcat, vcat, save, ROOT } from '../vmf/lib.mjs';
const { GRASS, STONE, SAND } = core;
const H = (z, x0, x1) => (x, zz) => zz === z && x >= x0 && x < x1;
const V = (x, z0, z1) => (xx, z) => xx === x && z >= z0 && z < z1;
const any = (...fs) => (x, z) => fs.some((f) => f(x, z));
const CASES = {
  'X 1-wide': any(H(16, 6, 26), V(16, 6, 26)),
  'X 2-wide': any((x, z) => (z === 16 || z === 17) && x >= 6 && x < 26, (x, z) => (x === 16 || x === 17) && z >= 6 && z < 26),
  'T 1-wide': any(H(10, 6, 26), V(16, 10, 26)),
  'L 1-wide (90° turn)': any(H(10, 6, 17), V(16, 10, 26)),
  'plus sign (5 blocks)': any(H(16, 15, 18), V(16, 15, 18)),
  'X 1-wide, 1 apart crossings (#)': any(H(13, 6, 26), H(19, 6, 26), V(13, 6, 26), V(19, 6, 26)),
  'ladder (rails 3 apart, rungs every 2)': (x, z) => (z === 14 || z === 17 ? x >= 6 && x < 26 : z > 14 && z < 17 && x >= 6 && x < 26 && x % 2 === 0),
};
const apps = [await loadApproach('approaches/hints.mjs'), await loadApproach('approaches/mf-iso.mjs'), await loadApproach('approaches/vmx-codes.mjs')];
const rows = [];
for (const [label, f] of Object.entries(CASES)) {
  const plan = (x, z) => (f(x, z) ? STONE : GRASS);
  const res = [], imgs = [];
  for (const A of apps) {
    const m = A.mesh(core.buildRegion(flatGround(plan), A.apron ?? 10), null, core);
    const img = planRaster(m, { x0: 4, z0: 4, w: 24, h: 24, S: 16, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
    const st = matStats(img, [4, 4, 28, 28]);
    res.push(`${A.name} ${st.parts[STONE]} part${st.parts[STONE] === 1 ? '' : 's'} (area ${st.area[STONE].toFixed(1)})`);
    imgs.push(planRgb(img));
  }
  let cells = 0; for (let z = 4; z < 28; z++) for (let x = 4; x < 28; x++) if (f(x, z)) cells++;
  console.log(`${label} [${cells} blocks]: ${res.join(' | ')}`);
  rows.push(hcat(imgs, 4));
}
save(join(ROOT, 'out', 'vmx-adv', 'junctions.png'), vcat([hcat(rows.slice(0, 4), 8), hcat(rows.slice(4), 8)], 8));
