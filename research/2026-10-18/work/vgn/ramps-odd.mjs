// vgn: built (edited) ramps at slopes whose stair period is NOT 2 or 4
// (the 4-wide box cancels period-2/4 harmonics): 1:3, 2:3, 1:5, 1:6, 3:4,
// plus 1:2 and 1:4 as controls. AO roughness on the ramp top (harness metric
// style: AO minus the mean of its mesh neighbours), production vs gn-best.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { ground, BASE } from './thin-scenes.mjs';
import { STONE } from '../../harness/core.mjs';
import { renderRow } from './world.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
function roughOn(m, sel) {
  const qk = (v) => `${Math.round(m.pos[v * 3] * 256)},${Math.round(m.pos[v * 3 + 1] * 256)},${Math.round(m.pos[v * 3 + 2] * 256)}`;
  const ao = new Map(), nb = new Map(), keep = new Set();
  for (let v = 0; v < m.V; v++) { const k = qk(v); ao.set(k, m.ao[v]); if (sel(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2])) keep.add(k); }
  for (let t = 0; t < m.T; t++) for (let e = 0; e < 3; e++) { const a = qk(m.tri[t * 3 + e]), b = qk(m.tri[t * 3 + (e + 1) % 3]); if (!nb.has(a)) nb.set(a, new Set()); if (!nb.has(b)) nb.set(b, new Set()); nb.get(a).add(b); nb.get(b).add(a); }
  let s2 = 0, n = 0, mx = 0;
  for (const k of keep) { const set = nb.get(k); if (!set) continue; let s = 0, c = 0; for (const o of set) { s += ao.get(o); c++; } const r = ao.get(k) - s / c; s2 += r * r; n++; mx = Math.max(mx, Math.abs(r)); }
  return [Math.sqrt(s2 / n), mx];
}
for (const [rise, run] of [[1, 2], [1, 4], [1, 3], [2, 3], [3, 4], [1, 5], [1, 6]]) {
  const cell = (x, y, z) => (y >= BASE && x >= 4 && x < 28 && z >= 6 && z < 26 && (y - BASE + 0.5) < (x - 4 + 0.5) * rise / run ? { v: STONE, edited: true } : ground(x, y, z));
  const r = core.buildRegion(cell, 10);
  const P = core.decodeMesh(repoMesh({ ...r, params: {} })), G = core.decodeMesh(gnMesh({ ...r, params: PARAMS }));
  const sel = (x, y, z) => x > 7 && x < 25 && z > 9 && z < 23 && y > BASE + 0.3;
  const [rp, mp] = roughOn(P, sel), [rg, mg] = roughOn(G, sel);
  console.log(`built ramp ${rise}:${run}: AO roughness prod ${rp.toFixed(3)} (max ${mp.toFixed(2)}) → gn ${rg.toFixed(3)} (max ${mg.toFixed(2)})`);
  if (`${rise}:${run}` === '1:3' || `${rise}:${run}` === '2:3') renderRow(`${OUT}ramp-${rise}-${run}.png`, [P, G], { eye: [3, BASE + 14, 30], target: [16, BASE + 3, 16], fov: 55, width: 420, height: 320 });
}
