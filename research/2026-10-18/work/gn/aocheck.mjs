// AO must keep its purpose: darken real concave corners and overhangs.
// Built test pieces on hinted flat ground (top at BASE); reports mean AO of
// the vertices that should be dark, and the falloff with distance.
//   node work/gn/aocheck.mjs [variant ...]   (variants from variants.mjs set 'check')
import * as core from '../../harness/core.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { meshRegion } from './mesher-gn.mjs';
import { SETS } from './variants.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { mkdirSync } from 'node:fs';
const { AIR, GRASS, DIRT, STONE, PLANKS } = core;
const BASE = 6;
const ground = (top) => (x, y, z) => {
  const d = top - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = top - 1 - y;
  return { v: depth === 0 ? GRASS : depth <= 3 ? DIRT : STONE, rho: clampRho(d) };
};
const g = ground(BASE);
const built = (inside, v = STONE) => (x, y, z) => (y >= BASE && inside(x, y, z) ? { v, edited: true } : g(x, y, z));
export const CHECKS = [
  { name: 'wall-foot', cell: built((x, y, z) => x >= 16 && y < BASE + 4),
    probe: (p) => Math.abs(p[1] - BASE) < 0.35 && p[2] > 8 && p[2] < 24, dist: (p) => 16 - p[0],
    camera: { eye: [6, BASE + 7, 30], target: [16, BASE + 1, 16] } },
  { name: 'inside-corner', cell: built((x, y, z) => (x >= 16 || z >= 16) && y < BASE + 4),
    probe: (p) => Math.abs(p[1] - BASE) < 0.35, dist: (p) => Math.max(0, Math.hypot(Math.max(0, 16 - p[0]), Math.max(0, 16 - p[2])) ),
    camera: { eye: [6, BASE + 8, 6], target: [16, BASE + 1, 16] } },
  { name: 'overhang', cell: built((x, y, z) => x >= 16 && y === BASE + 1, PLANKS),
    probe: (p) => Math.abs(p[1] - BASE) < 0.35 && p[2] > 8 && p[2] < 24, dist: (p) => 3 - (p[0] - 16),
    camera: { eye: [8, BASE + 3, 30], target: [18, BASE + 0.5, 16] } },
  { name: 'gap-1-high', cell: built((x, y, z) => x >= 12 && x < 21 && z >= 12 && z < 21 && y === BASE + 1, PLANKS),
    probe: (p) => Math.abs(p[1] - BASE) < 0.35 && p[0] > 14 && p[0] < 19 && p[2] > 14 && p[2] < 19, dist: () => 0,
    camera: { eye: [16.5, BASE + 2.5, 30], target: [16.5, BASE + 0.5, 16.5] } },
  { name: 'tunnel-floor', cell: (x, y, z) => {
      const dug = x === 16 && (y === 8 || y === 9) && z >= 4 && z < 28;
      return y < 12 && !dug ? { v: STONE } : { v: AIR, edited: dug };
    },
    probe: (p) => Math.abs(p[1] - 8) < 0.35 && p[2] > 8 && p[2] < 24 && p[0] > 15.6 && p[0] < 17.4, dist: () => 0,
    camera: { eye: [16.5, 9, 31], target: [16.5, 9, 16] } },
  { name: 'flat-open', cell: g,
    probe: (p) => Math.abs(p[1] - BASE) < 0.35, dist: () => 0,
    camera: { eye: [16, BASE + 8, 30], target: [16, BASE, 16] } },
];
const names = process.argv.slice(2);
const set = SETS.check;
const use = names.length ? names : Object.keys(set);
mkdirSync('work/gn/img', { recursive: true });
const rows = [];
for (const c of CHECKS) {
  const region = core.buildRegion(c.cell, 12);
  const line = [c.name];
  for (const vn of use) {
    const m = core.decodeMesh(meshRegion({ ...region, params: set[vn] }));
    // probe vertices: mean AO by distance bucket 0, 1, 2, 3
    const buckets = [[], [], [], []];
    for (let v = 0; v < m.V; v++) {
      const p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
      if (!c.probe(p)) continue;
      const d = c.dist(p);
      if (d < -0.5) continue;
      const b = Math.round(Math.max(0, d));
      if (b < 4) buckets[b].push(m.ao[v]);
    }
    const mean = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '—');
    line.push(`${vn}: ${buckets.map(mean).join(' ')}`);
    if (process.env.IMG) {
      const img = renderShaded(m, { ...c.camera });
      mkdirSync(`work/gn/img/${vn}`, { recursive: true });
      writePng(`work/gn/img/${vn}/${c.name}.png`, img.width, img.height, img.rgb);
    }
  }
  rows.push(line.join(' | '));
}
console.log('mean AO of probe vertices at distance 0 1 2 3 blocks from the concave edge (overhang: 3 2 1 0 blocks under the ledge)');
for (const r of rows) console.log(r);
