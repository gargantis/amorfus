// Top-face height of a placed 4×4 one-high slab on natural ground at hint
// phases, with caps OFF in the slab's top cells (context caps, no ceiling)
// and with/without midpoint crossings; plus the production rule.
import { meshWorld, slice } from './viz.mjs';
import { natural, placed } from './phys.mjs';
import { meshRegion as gsMesh } from '../gs/mesher-gs.mjs';
import { meshRegion as libMesh } from '../../lib/mesher.mjs';
import { params as ctx } from '../../approaches/gs-ctx.mjs';
const V = { 'hints (D-3 caps)': { mesh: libMesh, params: {} }, 'ctx caps, no editMid': { mesh: gsMesh, params: { ...ctx, editMid: false, rDilate: 0, k: 0 } }, 'ctx caps + editMid': { mesh: gsMesh, params: { ...ctx, rDilate: 0, k: 0 } } };
for (const ph of [-0.3, 0, 0.3, 0.45]) {
  const fn = (x, y, z) => (y === 8 && x >= 14 && x < 18 && z >= 14 && z < 18 ? placed() : natural(y, 8 + ph));
  const row = [];
  for (const [n, v] of Object.entries(V)) {
    const segs = slice(meshWorld(fn, v), 2, 16.01);
    let y16 = -Infinity;
    for (const s of segs) { const lo = Math.min(s[0], s[2]), hi = Math.max(s[0], s[2]); if (lo <= 16 && hi >= 16) { const f = (16 - s[0]) / ((s[2] - s[0]) || 1); const y = s[1] + (s[3] - s[1]) * f; if (y > y16) y16 = y; } }
    row.push(`${n}: top ${(y16 - 9).toFixed(3)}`);
  }
  console.log(`φ${ph}: ${row.join(' | ')}`);
}
