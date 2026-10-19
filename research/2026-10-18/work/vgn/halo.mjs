// vgn: light halo on the ground around builds. Rendered light of ground
// vertices, (0.9·max(0, n·sun) + 0.35 + 0.25(n.y/2 + ½))·AO, by distance from
// the footprint, on the sun-facing side (+x/+z) and the far side, against
// open flat ground (n = up, AO 1): light 1.334.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { ground, BASE } from './thin-scenes.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { STONE, PLANKS } from '../../harness/core.mjs';
const SUN = [0.5, 0.8, 0.3].map((x) => x / Math.hypot(0.5, 0.8, 0.3));
const L = (n, ao) => (0.9 * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) + 0.35 + 0.25 * (n[1] * 0.5 + 0.5)) * ao;
const OPEN = L([0, 1, 0], 1);
const scenes = [
  ['tower-r4.6 (harness)', ALL_SCENES.find((s) => s.name === 'tower-r4.6').cell, [16, 16], 'radial'],
  ['mound-r6.4 (harness)', ALL_SCENES.find((s) => s.name === 'mound-r6.4').cell, [16, 16], 'radial'],
  ['4x4 block 3 high', (x, y, z) => (y >= BASE && y < BASE + 3 && x >= 14 && x < 18 && z >= 14 && z < 18 ? { v: STONE, edited: true } : ground(x, y, z)), [16, 16], 'box'],
  ['1-wide fence 3 high', (x, y, z) => (y >= BASE && y < BASE + 3 && x === 16 && z >= 8 && z < 24 ? { v: PLANKS, edited: true } : ground(x, y, z)), [16.5, 16], 'xline'],
];
for (const [name, cell, c, kind] of scenes) {
  const r = core.buildRegion(cell, 10);
  const P = core.decodeMesh(repoMesh({ ...r, params: {} })), G = core.decodeMesh(gnMesh({ ...r, params: PARAMS }));
  // ground surface height: the scene's ground top (harness BASE = 6 too)
  const res = { prod: {}, gn: {} };
  for (const [k, m] of [['prod', P], ['gn', G]]) {
    // build footprint from vertices above BASE + 0.5
    const foot = [];
    for (let v = 0; v < m.V; v++) if (m.pos[v * 3 + 1] > BASE + 0.6) foot.push([m.pos[v * 3], m.pos[v * 3 + 2]]);
    for (let v = 0; v < m.V; v++) {
      const y = m.pos[v * 3 + 1];
      if (Math.abs(y - BASE) > 0.12) continue;
      const x = m.pos[v * 3], z = m.pos[v * 3 + 2];
      let d = 99, fx = 0, fz = 0;
      for (const [a, b] of foot) { const dd = Math.hypot(x - a, z - b); if (dd < d) { d = dd; fx = x - a; fz = z - b; } }
      const bucket = Math.round(d);
      if (bucket < 1 || bucket > 5) continue;
      const side = fx * SUN[0] + fz * SUN[2] > 0 ? 'sun' : 'far';
      const key = `${side}${bucket}`;
      const l = L([m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]], m.ao[v]);
      const e = res[k][key] ?? { s: 0, n: 0, mx: 0 };
      e.s += l; e.n++; e.mx = Math.max(e.mx, l); res[k][key] = e;
    }
  }
  const row = (k, side) => [1, 2, 3, 4, 5].map((b) => { const e = res[k][`${side}${b}`]; return e ? ((e.s / e.n) / OPEN).toFixed(3) : '  —  '; }).join(' ');
  const mx = (k) => Math.max(...Object.values(res[k]).map((e) => e.mx)) / OPEN;
  console.log(`${name}: ground light / open-ground light at distance 1..5\n   sun side  prod ${row('prod', 'sun')} | gn ${row('gn', 'sun')}\n   far side  prod ${row('prod', 'far')} | gn ${row('gn', 'far')}\n   brightest ground vertex: prod ×${mx('prod').toFixed(3)}, gn ×${mx('gn').toFixed(3)}`);
}
