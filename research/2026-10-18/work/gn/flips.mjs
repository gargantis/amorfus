// Thin-feature failure check: angle between a variant's normal and the
// production area normal, per vertex, on built scenes and thin pieces.
//   node work/gn/flips.mjs <set> <variant,...>
import * as core from '../../harness/core.mjs';
import { ALL_SCENES, BASE } from '../../harness/scenes.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { meshRegion } from './mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { SETS } from './variants.mjs';
import { CHECKS } from './aocheck-scenes.mjs';
const { AIR, GRASS, DIRT, STONE, PLANKS } = core;
const ground = (top) => (x, y, z) => {
  const d = top - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = top - 1 - y;
  return { v: depth === 0 ? GRASS : depth <= 3 ? DIRT : STONE, rho: clampRho(d) };
};
const g = ground(BASE);
const built = (inside, v = STONE) => (x, y, z) => (y >= BASE && inside(x, y, z) ? { v, edited: true } : g(x, y, z));
const extra = [
  { name: 'slab-gap1', cell: built((x, y, z) => x >= 8 && x < 24 && z >= 8 && z < 24 && y === BASE + 1, PLANKS) },
  { name: 'slab-gap2 (roof)', cell: built((x, y, z) => x >= 8 && x < 24 && z >= 8 && z < 24 && y === BASE + 2, PLANKS) },
  { name: 'slab-gap3', cell: built((x, y, z) => x >= 8 && x < 24 && z >= 8 && z < 24 && y === BASE + 3, PLANKS) },
  { name: 'house 1-thick', cell: built((x, y, z) => x >= 8 && x < 24 && z >= 8 && z < 24 && y < BASE + 5 && (x === 8 || x === 23 || z === 8 || z === 23 || y === BASE + 4), PLANKS) },
  { name: 'two walls gap1', cell: built((x, y, z) => (x === 14 || x === 16) && z >= 8 && z < 24 && y < BASE + 5) },
];
const scenes = [...ALL_SCENES.filter((s) => ['ramp-1:4', 'mound-r6.4', 'pit-r5.4', 'tower-r4.6', 'roof-2-high', 'pillar', 'floating-block'].includes(s.name)), ...CHECKS.filter((c) => c.name === 'overhang'), ...extra];
const [set, list] = process.argv.slice(2);
for (const vn of list.split(',')) {
  const params = SETS[set] ? SETS[set][vn] : null;
  const rows = [];
  for (const s of scenes) {
    const region = core.buildRegion(s.cell, 10);
    const m = core.decodeMesh(meshRegion({ ...region, params }));
    const r = core.decodeMesh(repoMesh({ ...region, params: {} }));
    // same vertex order (positions identical): compare per vertex
    let n = 0, d45 = 0, d90 = 0, worst = 0;
    for (let v = 0; v < m.V; v++) {
      if (m.flags[v] & 1) continue;
      const a = core.angleDeg(m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2], r.nrm[v * 3], r.nrm[v * 3 + 1], r.nrm[v * 3 + 2]);
      n++;
      if (a > 45) d45++;
      if (a > 90) d90++;
      if (a > worst) worst = a;
    }
    rows.push(`${s.name}: >45° ${d45}, >90° ${d90} of ${n}, worst ${worst.toFixed(0)}°`);
  }
  console.log(`== ${vn}\n  ${rows.join('\n  ')}`);
}
