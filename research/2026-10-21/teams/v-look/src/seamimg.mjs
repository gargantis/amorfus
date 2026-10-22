// Zoomed section of the halves4 seam: LABEL cells coloured by material, the
// render field's surface (D = 0) drawn as a yellow line. One PNG per regime.
//   node src/seamimg.mjs <REGIME> <n>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { simulate, sampleGrid } from '../../../lib/mbo.mjs';
import { simulate as simulateLook } from '../../look/src/mbo-look.mjs';
import { savePng, PALETTE } from '../../../lib/render.mjs';
const V = new URL('..', import.meta.url).pathname;
const [reg, nStr] = process.argv.slice(2); const n = +nStr;
const fl = (v) => Math.floor(v * n + 1e-9) / n;
const REG = {
  'FID-0.15': { anchor: { kind: 'fidelity', k: 0.15 } },
  'FINITE-4': { maxSteps: 4, stopAfter: 99 },
  'CAGE-0.25': { anchor: { kind: 'cage', r: 0.25 } },
  FREE: { maxSteps: 400 },
  'C15-V0': { engine: 'look', anchor: { kind: 'fidelity', k: 0.15, kMat: 0.02, box: { outH: fl(0.15), outV: 0, inH: 0.25, inV: 0.25 } } },
};
const blocks = []; for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) blocks.push([x, 0, z, x < 2 ? 6 : 7]);
const { engine, ...opts } = REG[reg];
const sim = (engine === 'look' ? simulateLook : simulate)(blocks, { ...opts, n, margin: reg === 'FREE' ? 1 : 0.5 });
const x0 = 1.0, x1 = 3.0, y0 = 0.4, y1 = 1.8, zc = 2.0, ppb = 240;
const W = Math.round((x1 - x0) * ppb), H = Math.round((y1 - y0) * ppb);
const rgb = new Uint8Array(W * H * 3);
const k = Math.floor((zc - sim.oz) * n);
const labAt = (x, y) => { const i = Math.floor((x - sim.ox) * n), j = Math.floor((y - sim.oy) * n); if (i < 0 || j < 0 || i >= sim.NX || j >= sim.NY) return 0; return sim.label[(k * sim.NY + j) * sim.NX + i]; };
const Dv = new Float64Array(W * H);
for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
  const x = x0 + (px + 0.5) / ppb, y = y1 - (py + 0.5) / ppb;
  const p = labAt(x, y);
  let col = p ? PALETTE[sim.phases[p].mat] : [26, 28, 34];
  // sub-cell grid
  const fx = (x - sim.ox) * n, fy = (y - sim.oy) * n;
  if (Math.abs(fx - Math.round(fx)) * ppb / n < 0.5 || Math.abs(fy - Math.round(fy)) * ppb / n < 0.5) col = col.map((c) => c * 0.85 + 10);
  // block grid
  if (Math.abs(x - Math.round(x)) * ppb < 1 || Math.abs(y - Math.round(y)) * ppb < 1) col = [200, 200, 200];
  Dv[py * W + px] = sampleGrid(sim, sim.D, x, y, zc);
  const q = (py * W + px) * 3; rgb[q] = col[0]; rgb[q + 1] = col[1]; rgb[q + 2] = col[2];
}
// D = 0 contour
for (let py = 1; py < H - 1; py++) for (let px = 1; px < W - 1; px++) {
  const s = Dv[py * W + px] > 0;
  if (s !== (Dv[py * W + px + 1] > 0) || s !== (Dv[(py + 1) * W + px] > 0)) for (const [a, b] of [[0, 0], [1, 0], [0, 1]]) { const q = ((py + b) * W + px + a) * 3; rgb[q] = 255; rgb[q + 1] = 220; rgb[q + 2] = 40; }
}
mkdirSync(join(V, 'img', 'seamzoom'), { recursive: true });
savePng(join(V, 'img', 'seamzoom', `halves4-${reg}@n${n}.png`), { width: W, height: H, rgb });
console.log(reg, n, sim.steps, sim.converged);
