// VGS: edit-path cost (REMESH of one 52³ region, mesher only), interleaved
// min-of-N across variants so machine load hits all equally. Worst cases:
// scaffolding lattice, 50% rubble, dug cave sponge, plus the team's dense build.
//   N=9 node work/vgs/editcost.mjs [variants]
import { VARIANTS, clampRho, AIR, GRASS, DIRT, STONE, PLANKS } from './phys.mjs';
import { GEOMETRY_SCENES } from '../../harness/scenes.mjs';
const vs = (process.argv[2] ?? 'hints,gs-ctx,gs-mls').split(',');
const N = Number(process.env.N ?? 9);
const hash = (x, y, z) => { let h = Math.imul(x * 374761393 + y * 1103515245 + z * 668265263, 1274126177) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h >>> 8) / 16777216; };
const ground = (x, y, z) => { const top = 6.3 + 0.15 * Math.sin(x * 0.21) * Math.cos(z * 0.17); const d = top - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) }; };
const hf = (x, z) => { let s = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s += hash((x >> 2) + a, 0, (z >> 2) + b); return Math.floor((s * 8) / 9); };
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const rock = (y) => { const d = 12 - (y + 0.5); return d <= 0 ? { v: AIR, rho: clampRho(d) } : { v: STONE, rho: clampRho(d) }; };
const house = (x, y, z, x0, z0) => {
  // hollow 7×7 house, walls 4 high on y 6..9, flat roof y 10, door + windows
  const lx = x - x0, lz = z - z0;
  if (lx < 0 || lx > 6 || lz < 0 || lz > 6 || y < 6 || y > 10) return null;
  if (y === 10) return { v: PLANKS, edited: true };
  const wall = lx === 0 || lx === 6 || lz === 0 || lz === 6;
  if (!wall) return null;
  if (lx === 3 && lz === 0 && (y === 6 || y === 7)) return null; // door
  if (y === 8 && ((lz === 3 && (lx === 0 || lx === 6)) || (lx === 3 && lz === 6))) return null; // windows
  return { v: PLANKS, edited: true };
};
const SCENES = {
  'strip mine: 1×2 tunnels every 3 blocks (x) + cross tunnels every 8 (z), 2 levels': (x, y, z) => {
    const lvl = y === 0 || y === 1 || y === -6 || y === -5;
    if (lvl && ((((x % 3) + 3) % 3 === 0) || (((z % 8) + 8) % 8 === 0))) return { v: AIR, edited: true };
    return rock(y);
  },
  'village: 16 hollow 7×7 houses with roof/door/windows': (x, y, z) => {
    for (let i = -1; i < 4; i++) for (let j = -1; j < 4; j++) { const h = house(x, y, z, i * 9 + 1, j * 9 + 1); if (h) return h; }
    return ground(x, y, z);
  },
  'lattice tower: 1-wide beams every 4 blocks, 3D, 20 high': (x, y, z) => {
    if (y >= 6 && y < 26) {
      const m = (v) => ((v % 4) + 4) % 4 === 0;
      if ((m(x) && m(y)) || (m(y) && m(z)) || (m(x) && m(z))) return { v: PLANKS, edited: true };
    }
    return ground(x, y, z);
  },
  'team dense build (heightfield 1–8)': (x, y, z) => (y >= 6 && y < 6 + hf(x, z) ? { v: STONE, edited: true } : ground(x, y, z)),
  'ramp-1:4 (team)': GEOMETRY_SCENES.find((s) => s.name === 'ramp-1:4').cell,
  'scaffold: 1-wide beams every 3 blocks, 3D': (x, y, z) => {
    if (y >= 6 && y < 30 && x >= -6 && x < 38 && z >= -6 && z < 38) {
      const m = (v) => ((v % 3) + 3) % 3 === 0;
      const beams = (m(x) && m(y)) || (m(y) && m(z)) || (m(x) && m(z));
      return beams ? { v: PLANKS, edited: true } : ground(x, y, z);
    }
    return ground(x, y, z);
  },
  'rubble: 35% random placed blocks over y 6–20': (x, y, z) => (y >= 6 && y < 20 && hash(x, y, z) < 0.35 ? { v: STONE, edited: true } : ground(x, y, z)),
  'cave sponge: dug 45% of a stone mass y −8..6': (x, y, z) => (y >= -8 && y < 5 && hash(x, y, z) < 0.45 ? { v: AIR, edited: true } : ground(x, y, z)),
};
function region(fn, A = 10) {
  const n = 32 + 2 * A;
  const blocks = new Uint16Array(n * n * n), rho = new Float32Array(n * n * n), shapeEdited = new Uint8Array(n * n * n);
  for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const c = fn(x - A, y - A, z - A);
    const i = (y * n + z) * n + x;
    blocks[i] = c.v; rho[i] = c.rho ?? (c.v === AIR ? -1 : 1); shapeEdited[i] = c.edited ? 1 : 0;
  }
  return { nx: n, ny: n, nz: n, apron: A, blocks, rho, shapeEdited };
}
for (const [name, fn] of Object.entries(SCENES)) {
  if (ONLY && !ONLY.test(name)) continue;
  const r = region(fn);
  const best = vs.map(() => Infinity);
  const info = vs.map(() => '');
  for (let it = 0; it < N + 1; it++) {
    for (let k = 0; k < vs.length; k++) {
      const V = VARIANTS[vs[k]];
      const t0 = performance.now();
      const m = V.mesh({ ...r, params: V.params });
      const t = performance.now() - t0;
      if (it > 0 && t < best[k]) best[k] = t;
      info[k] = `${m.quadCount * 2} tris${m.stats ? `, R ${m.stats.R ?? '-'}${m.stats.fitted ? `, fitted ${m.stats.fitted}, pts ${m.stats.mlsPoints}` : ''}` : ''}`;
    }
  }
  console.log(name);
  for (let k = 0; k < vs.length; k++) console.log(`   ${vs[k].padEnd(7)} min ${best[k].toFixed(1)} ms  (+${(best[k] - best[0]).toFixed(1)} vs ${vs[0]})  ${info[k]}`);
}
