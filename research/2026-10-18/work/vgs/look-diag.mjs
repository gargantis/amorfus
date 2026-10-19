import { join } from 'node:path';
import { meshWorld, renderPanels, IMG } from './viz.mjs';
import { GRASS, DIRT, STONE, clampRho, AIR } from './phys.mjs';
const nat = (top) => (y) => { const d = top - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) }; };
const G = nat(8.2);
const fn = (x, y, z) => (y === 8 && x + z >= 32 ? { v: STONE, edited: true } : G(y)); // 1:1 diagonal 1-high step
const fn2 = (x, y, z) => (y === 8 && x + 2 * z >= 48 ? { v: STONE, edited: true } : G(y)); // 1:2 diagonal
for (const [nm, f] of [['diag11', fn], ['diag12', fn2]]) for (const noao of [false, true]) {
  const panels = ['hints', 'gs-ctx', 'gs-mls'].map((v) => ({ mesh: meshWorld(f, v) }));
  console.log(renderPanels(join(IMG, `look-step-${nm}${noao ? '-noao' : ''}.png`), panels, { eye: [10.5, 11.6, 10.5], target: [17, 8.4, 17], fovDeg: 55 }, { width: 400, height: 300, noao }));
}
