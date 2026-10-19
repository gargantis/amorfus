// Plan-view stone|grass boundary jaggedness along BUILT 1-high steps (straight,
// 1:1, 1:2, 1:3 diagonal in plan) on natural ground: std / maxDev (blocks) of the
// boundary's perpendicular offset about its own mean line.
import { meshWorld } from './viz.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { GRASS, DIRT, STONE, clampRho, AIR } from './phys.mjs';
const nat = (y) => { const d = 8.2 - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) }; };
const steps = { 'straight (edge along z)': [1, 0, 16], '1:3': [1, 3, 64], '1:2': [1, 2, 48], '1:1': [1, 1, 32] };
for (const [nm, [a, b, c]] of Object.entries(steps)) {
  const fn = (x, y, z) => (y === 8 && a * x + b * z >= c ? { v: STONE, edited: true } : nat(y));
  const row = [];
  for (const v of ['cubes', 'hints', 'gs-ctx', 'gs-mls']) {
    const m = meshWorld(fn, v);
    const img = rasterTopDown(m, { x0: 0, z0: 0, w: 32, h: 32, S: 32 });
    // boundary samples: for each pixel row z, first stone pixel scanning +x (inside a window away from chunk edges)
    const L = Math.hypot(a, b), off = [];
    for (let j = 6 * 32; j < 26 * 32; j++) {
      for (let i = 1; i < img.W; i++) {
        if (img.mat[j * img.W + i] === STONE && img.mat[j * img.W + i - 1] === GRASS) {
          const x = (i) / 32, z = (j + 0.5) / 32;
          off.push((a * x + b * z - c) / L);
          break;
        }
      }
    }
    const mean = off.reduce((s, v) => s + v, 0) / off.length;
    const std = Math.sqrt(off.reduce((s, v) => s + (v - mean) ** 2, 0) / off.length);
    const mx = Math.max(...off.map((v) => Math.abs(v - mean)));
    row.push(`${v} ${std.toFixed(3)}/${mx.toFixed(3)}`);
  }
  console.log(`${nm.padEnd(24)} ${row.join('   ')}`);
}
