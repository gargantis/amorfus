// vmv (added when recording, from the audit of this record): count the stone
// parts of neck.mjs's 1:1 line after ONE stone paint, for each paint position,
// with work/vmf/lib.mjs matStats. The corner paint at 15,17 is the case that
// necks mv-quad's band to 0.008 in neck.txt.
//   node work/vmv/neck-parts.mjs approaches/hints.mjs approaches/mv-quad.mjs
import * as core from '../../harness/core.mjs';
import { flatGround } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster, matStats } from '../vmf/lib.mjs';
const { GRASS, STONE } = core;
const S = 64;
for (const f of process.argv.slice(2)) {
  const A = await loadApproach(f);
  for (const [px, pz] of [[null, null], [15, 16], [16, 15], [15, 17], [15, 14]]) {
    const plan = (x, z) => (x === px && z === pz ? STONE : x >= 4 && x < 28 && z === x ? STONE : GRASS);
    const region = core.buildRegion(flatGround(plan), A.apron ?? 10);
    const img = planRaster(A.mesh(region, null, core), { x0: 6, z0: 6, w: 20, h: 20, S, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
    const st = matStats(img, [9, 9, 23, 23]);
    console.log(`${A.name} paint ${px},${pz}: stone parts in [9,23)² ${st.parts[STONE]} (+${st.specks[STONE]} specks), area ${st.area[STONE].toFixed(2)}`);
  }
}
