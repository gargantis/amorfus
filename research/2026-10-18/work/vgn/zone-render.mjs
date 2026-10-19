// vgn: a 3×3 platform and a 1-wide 3-high fence on a generated hillside.
// Panels: production with the build | gn-best with the build | |gn(build) −
// gn(no build)| luminance ×4 (shows the shading footprint of the build).
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { setBlock } from './util.mjs';
import { meshWorld } from './world.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
const seed = [1, 1];
const PLANKS = 5;
function topAt(wx, wz) {
  for (let cy = 3; cy >= -1; cy--) {
    const inp = buildGenMeshInput(seed, Math.floor(wx / 32), cy, Math.floor(wz / 32), new Map(), { forceApron: 0 }).input;
    const lx = wx - Math.floor(wx / 32) * 32, lz = wz - Math.floor(wz / 32) * 32;
    for (let y = 31; y >= 0; y--) if ((inp.blocks[(y * 32 + lz) * 32 + lx] & 0xff) !== 0) return cy * 32 + y;
  }
}
const x0 = -32 + 12, z0 = 32 + 14;
const builds = {
  platform: (e) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) setBlock(e, x0 + dx, topAt(x0 + dx, z0 + dz) + 1, z0 + dz, PLANKS); },
  fence: (e) => { for (let dz = -5; dz <= 5; dz++) { const t = topAt(x0, z0 + dz); for (let h = 1; h <= 3; h++) setBlock(e, x0, t + h, z0 + dz, PLANKS); } },
};
for (const [name, fn] of Object.entries(builds)) {
  const e = new Map();
  fn(e);
  const y = topAt(x0, z0);
  const W = meshWorld(seed, [-2, 1, 0], [0, 1, 2], e);
  const W0 = meshWorld(seed, [-2, 1, 0], [0, 1, 2], new Map(), ['gn']);
  const cam = { eye: [x0 + 9, y + 6, z0 + 10], target: [x0, y + 1, z0], fovDeg: 55, width: 420, height: 320 };
  const a = renderShaded(W.prod, cam), b = renderShaded(W.gn, cam), c = renderShaded(W0.gn, cam);
  const gap = 4, w = a.width, h = a.height, WW = 3 * w + 2 * gap;
  const rgb = new Uint8Array(WW * h * 3).fill(255);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    for (let k = 0; k < 3; k++) { rgb[(j * WW + i) * 3 + k] = a.rgb[(j * w + i) * 3 + k]; rgb[(j * WW + w + gap + i) * 3 + k] = b.rgb[(j * w + i) * 3 + k]; }
    const L = (im) => 0.3 * im.rgb[(j * w + i) * 3] + 0.59 * im.rgb[(j * w + i) * 3 + 1] + 0.11 * im.rgb[(j * w + i) * 3 + 2];
    const d = Math.min(255, Math.abs(L(b) - L(c)) * 4);
    const o = (j * WW + 2 * (w + gap) + i) * 3;
    rgb[o] = d; rgb[o + 1] = d; rgb[o + 2] = d;
  }
  writePng(`${OUT}hillside-${name}.png`, WW, h, rgb);
  console.log(`${OUT}hillside-${name}.png aprons`, JSON.stringify(W.aprons.map((r) => r[3])));
}
