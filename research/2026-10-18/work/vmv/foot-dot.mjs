// vmv: copy of work/vmf/foot-dot.mjs retargeted to hints | mf-iso | mv-quad, output to out/vmv-adv.
// vmf: on/off flicker of a lone painted block next to built grass blocks.
// Lone stone block at (15,7,16) in hinted grass; a 1-high built grass ledge
// at x = 16 occupies z ∈ [16−k, 16+k] (k = −1 means no ledge). Each k is one
// more placed block pair next to the dot. Reports the dot's displayed area.
import * as core from '../../harness/core.mjs';
import { flatGround, GROUND } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster, matStats } from '../vmf/lib.mjs';
const { GRASS, STONE } = core;
for (const p of ['approaches/hints.mjs', 'approaches/mf-iso.mjs', 'approaches/mv-quad.mjs']) {
  const A = await loadApproach(p);
  const out = [];
  for (let k = -1; k <= 4; k++) {
    const g = flatGround((x, z) => (x === 15 && z === 16 ? STONE : GRASS));
    const cell = (x, y, z) => (k >= 0 && y === GROUND && x === 16 && Math.abs(z - 16) <= k ? { v: GRASS, edited: true } : g(x, y, z));
    const m = A.mesh(core.buildRegion(cell, 10), null, core);
    const img = planRaster(m, { x0: 12, z0: 12, w: 8, h: 8, S: 64, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
    const st = matStats(img, [12, 12, 20, 20]);
    out.push(`ledge ${k < 0 ? 'none' : 2 * k + 1 + ' long'}: ${st.area[STONE].toFixed(3)}`);
  }
  console.log(`${A.name} lone stone dot area beside a 1-high grass ledge → ${out.join(' | ')}`);
}
