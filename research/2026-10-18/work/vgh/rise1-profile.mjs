// VGH: exact slice profiles (z = 16.5) of a placed 1-block rise (x >= 12,
// y = 8) on natural ground 8 + φ, for hints / gs-ctx / gh-cc8b, and the
// riser vertices with their lattice corners and the gh crossing types.
//   node work/vgh/rise1-profile.mjs [φ...]
import { join } from 'node:path';
import { natural, placed } from './phys.mjs';
import { meshWorld, slice, plotProfiles, IMG } from './viz.mjs';
import * as core from '../../harness/core.mjs';
import { contourCross6 } from '../gh/syn2.mjs';
import { CFG } from '../../approaches/gh-cc8b.mjs';

const phs = process.argv.slice(2).map(Number);
if (!phs.length) phs.push(-0.45, -0.3, 0.25);
const COL = { hints: [0, 90, 200], 'gs-ctx': [0, 160, 0], 'gh-cc8b': [210, 30, 30] };
for (const ph of phs) {
  const fn = (x, y) => (y === 8 && x >= 12 ? placed() : natural(y, 8 + ph));
  const lines = [];
  for (const v of ['hints', 'gs-ctx', 'gh-cc8b']) {
    const m = meshWorld(fn, v);
    const segs = slice(m, 2, 16.5).filter((s) => Math.max(s[0], s[2]) > 9 && Math.min(s[0], s[2]) < 15);
    lines.push({ segs, rgb: COL[v], w: 1 });
    // vertices near the riser at z corner 16/17
    const vs = [];
    for (let k = 0; k < m.V; k++) {
      const cx = m.corner[k * 3], cy = m.corner[k * 3 + 1], cz = m.corner[k * 3 + 2];
      if (cz === 17 && cx >= 11 && cx <= 13 && cy >= 8 && cy <= 9) vs.push(`c(${cx},${cy}) → (${m.pos[k * 3].toFixed(3)}, ${m.pos[k * 3 + 1].toFixed(3)})`);
    }
    console.log(`φ${ph} ${v}: ${vs.join('  ')}`);
  }
  // gh crossings on the riser's cell edges (z = 16 row)
  const region = core.buildRegion(fn, 10);
  const r = contourCross6(region, CFG);
  const ri = (x, y, z) => core.regionIndex(region, x, y, z);
  const ct = (x, y, z, a) => r.crossT[ri(x, y, z) * 3 + a];
  console.log(`   gh crossT: x-edge (11,8)->(12,8) ${ct(11, 8, 16, 0).toFixed(3)}  x-edge (11,7)->(12,7) ${ct(11, 7, 16, 0)}  y-edge (12,8)->(12,9) ${ct(12, 8, 16, 1).toFixed(3)}  y-edge (11,7)->(11,8) ${ct(11, 7, 16, 1)} (−1 = hint)`);
  const f = join(IMG, `rise1-profile-phi${ph}.png`);
  plotProfiles(f, { u0: 9, u1: 15, y0: 6.5, y1: 10, S: 90, cells: (u, y) => (y === 8 && u >= 12 ? 2 : natural(y, 8 + ph).v ? 1 : 0), lines });
  console.log('   ' + f);
}
