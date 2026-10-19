import { join } from 'node:path';
import { meshWorld, slice, renderPanels, IMG } from './viz.mjs';
import { natural, placed, binary, STONE, PLANKS } from './phys.mjs';
import { VARIANTS } from './phys.mjs';
const scenes = {
  'lone block on binary ground': (x, y, z) => (x === 16 && z === 16 && y === 8 ? placed() : binary(y)),
  'lone block on natural φ0.2': (x, y, z) => (x === 16 && z === 16 && y === 8 ? placed() : natural(y, 8.2)),
  'lone block on a 12×12 placed floor': (x, y, z) => ((y === 8 && x >= 10 && x < 22 && z >= 10 && z < 22) || (x === 16 && z === 16 && y === 9) ? placed(PLANKS) : binary(y)),
  '2-high pillar on binary': (x, y, z) => (x === 16 && z === 16 && (y === 8 || y === 9) ? placed() : binary(y)),
};
for (const [nm, fn] of Object.entries(scenes)) {
  const row = [];
  for (const v of ['cubes', 'hints', 'gs-ctx', 'gs-mls']) {
    const segs = slice(meshWorld(fn, v), 2, 16.5);
    const baseY = nm.includes('floor') ? 9 : 8;
    let top = -Infinity; const pts = [];
    for (const s of segs) for (const [u, y] of [[s[0], s[1]], [s[2], s[3]]]) { if (u > 12 && u < 21 && y > top) top = y; pts.push([u, y]); }
    // footprint: x-extent where the upper surface exceeds baseY + 0.05
    let lo = Infinity, hi = -Infinity;
    for (const [u, y] of pts) if (y > baseY + 0.05 && u > 10 && u < 23) { if (u < lo) lo = u; if (u > hi) hi = u; }
    row.push(`${v} top +${(top - baseY).toFixed(2)} footprint ${(hi - lo).toFixed(2)}`);
  }
  console.log(`${nm.padEnd(36)} ${row.join(' | ')}`);
}
const panels = ['hints', 'gs-ctx', 'gs-mls'].map((v) => ({ mesh: meshWorld(scenes['lone block on a 12×12 placed floor'], v) }));
console.log(renderPanels(join(IMG, 'look-lone-block-on-floor-noao.png'), panels, { eye: [12, 12.5, 23], target: [16, 9, 15], fovDeg: 55 }, { width: 400, height: 280, noao: true }));
// MLS skip/degrade statistics on dense builds
import { meshRegion as gsMesh } from '../gs/mesher-gs.mjs';
import { params as mls } from '../../approaches/gs-mls.mjs';
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
let sk = 0, dg = 0, fit = 0;
for (const s of ALL_SCENES) { const m = gsMesh({ ...core.buildRegion(s.cell, 10), params: mls }); sk += m.stats?.mlsSkipped ?? 0; dg += m.stats?.mlsDegraded ?? 0; fit += m.stats?.fitted ?? 0; }
console.log(`harness scenes: fitted ${fit}, degraded ${dg}, skipped ${sk}`);
