// Plan view across the x = 32 border of the seams world: chunk (0,0) for
// x < 32 and chunk (1,0) for x ≥ 32, each meshed from its own region.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { AIR, GRASS, DIRT, STONE, SAND, PLANKS } from '../../harness/core.mjs';
import { rasterTopDown, PALETTE } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
const out = process.argv[3];
const h = (x, z) => 9 + 4 * Math.exp(-((x - 30) ** 2 + (z - 34) ** 2) / (2 * 7 ** 2)) + 0.6 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
const plan = (x, z) => {
  if (Math.hypot(x + 0.5 - 31.2, z + 0.5 - 30.4) < 4.3) return STONE;
  if (z + 0.5 > 0.5 * (x + 0.5) + 30.7) return SAND;
  if (x - z === 6 && x > 20 && x < 44) return STONE;
  return GRASS;
};
const world = (x, y, z) => {
  if (Math.hypot(x + 0.5 - 33, y + 0.5 - 12, z + 0.5 - 12) < 5.2 && y >= 12) return { v: PLANKS, edited: true };
  if (z >= 40 && z < 48 && x >= 24 && x < 40 && y >= 12 && y + 0.5 < 12 + (x + 0.5 - 24) / 4) return { v: STONE, edited: true };
  if (Math.hypot(x + 0.5 - 40, y + 0.5 - 13, z + 0.5 - 31) < 4 && y < 13) return { v: AIR, edited: true };
  const d = h(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  return { v: depth <= 1 ? plan(x, z) : depth <= 4 ? DIRT : STONE, rho: clampRho(d) };
};
const S = 40, X0 = 24, Z0 = 18, W = 16, H = 16;
const rgb = new Uint8Array(W * S * H * S * 3);
for (const cx of [0, 1]) {
  const m = mod.mesh(core.buildRegion((x, y, z) => world(x + cx * 32, y, z), mod.apron ?? 10), null, core);
  const frag = mod.fragment ? (a, i) => mod.fragment(a, i, null) : null;
  const img = rasterTopDown(m, { x0: X0 - cx * 32, z0: Z0, w: W, h: H, S, fragment: frag });
  for (let j = 0; j < H * S; j++) for (let i = 0; i < W * S; i++) {
    const wx = X0 + (i + 0.5) / S;
    if ((wx < 32) !== (cx === 0)) continue;
    const mm = img.mat[j * W * S + i];
    const c = mm === 0 ? [20, 20, 20] : PALETTE[mm];
    const k = (j * W * S + i) * 3;
    const grid = (i % S === 0 || j % S === 0) ? 0.8 : 1;
    const border = Math.abs(wx - 32) < 0.5 / S ? 0.3 : 1;
    rgb[k] = c[0] * grid * border; rgb[k + 1] = c[1] * grid * border; rgb[k + 2] = c[2] * grid * border;
  }
}
writePng(out, W * S, H * S, rgb);
console.log(out);
