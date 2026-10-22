// Task 1 images: plan maps of the label top-height change (perturbed - base)
// on the 14x2x5 slab (n = 12) and 3D views. Saved with render.mjs savePng.
// node img1.mjs <regime> <kind> <d> [--view]
import { mkdirSync } from 'node:fs';
import { runSim } from './lib/loc.mjs';
import { finishLocal } from './lib/mbo-box.mjs';
import { renderView, savePng } from '../../lib/render.mjs';
const A = 6, B = 7;
const [regName, kind, dArg, flag] = process.argv.slice(2);
const d = +dArg, XP = 2, LX = 14, LZ = 5;
const slab = []; for (let x = 0; x < LX; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < LZ; z++) slab.push([x, y, z, A]);
const x0 = XP + d;
const pert = kind === 'add' ? slab.concat([[x0, 2, 2, A]]) : kind === 'remove' ? slab.filter((b) => !(b[0] === x0 && b[1] === 1 && b[2] === 2))
  : kind === 'recolour' ? slab.map((b) => (b[0] === x0 && b[1] === 1 && b[2] === 2 ? [x0, 1, 2, B] : b)) : null;
const ex = { n: 12, bbox: [0, 0, 0, LX - 1, 2, LZ - 1] };
const base = runSim(slab, regName, ex), sim = runSim(pert, regName, ex);
mkdirSync(new URL('./img/t1', import.meta.url), { recursive: true });
// column heights (top of highest solid cell) and bottoms, per (i,k)
const heights = (s) => {
  const { NX, NY, NZ, label } = s; const top = new Float32Array(NX * NZ).fill(NaN), bot = new Float32Array(NX * NZ).fill(NaN);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    for (let j = NY - 1; j >= 0; j--) if (label[(k * NY + j) * NX + i]) { top[k * NX + i] = j + 1; break; }
    for (let j = 0; j < NY; j++) if (label[(k * NY + j) * NX + i]) { bot[k * NX + i] = j; break; }
  }
  return { top, bot };
};
const hb = heights(base), hp = heights(sim);
const { NX, NZ, n, ox, oz } = base;
const ppc = 3; // pixels per sub-cell
const W = NX * ppc, H = NZ * ppc * 2 + 6;
const rgb = new Uint8Array(W * H * 3);
const put = (x, y, c) => { const q = (y * W + x) * 3; rgb[q] = c[0]; rgb[q + 1] = c[1]; rgb[q + 2] = c[2]; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, [250, 250, 250]);
const colour = (dv, inB, inP) => {
  if (!inB && !inP) return [30, 32, 38];
  if (inB !== inP) return inP ? [20, 160, 60] : [120, 60, 160]; // column appears / disappears
  if (dv === 0) return [205, 205, 205];
  const t = Math.min(1, Math.abs(dv) / 4); // 4 sub-cells = saturated
  return dv > 0 ? [255, Math.round(200 * (1 - t)), Math.round(200 * (1 - t))] : [Math.round(200 * (1 - t)), Math.round(200 * (1 - t)), 255];
};
for (const [panel, key, sign] of [[0, 'top', 1], [1, 'bot', -1]]) {
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    const b = hb[key][k * NX + i], p = hp[key][k * NX + i];
    const inB = !Number.isNaN(b), inP = !Number.isNaN(p);
    const dv = inB && inP ? sign * (p - b) : 0;
    let c = colour(dv, inB, inP);
    const bx = ox + (i + 0.5) / n, bz = oz + (k + 0.5) / n;
    if (Math.abs(bx - Math.round(bx)) < 0.5 / n || Math.abs(bz - Math.round(bz)) < 0.5 / n) c = c.map((v) => Math.round(v * 0.8));
    for (let yy = 0; yy < ppc; yy++) for (let xx = 0; xx < ppc; xx++) put(i * ppc + xx, panel * (NZ * ppc + 6) + k * ppc + yy, c);
  }
}
const tag = `${regName}-${kind}-d${d}`;
savePng(new URL(`./img/t1/map-${tag}.png`, import.meta.url).pathname, { width: W, height: H, rgb });
console.log('map', tag, 'top panel = top face (red up, blue down, 4 sub-cells saturate), bottom panel = bottom face (red = outward)');
if (flag === '--view') {
  const bounds = { min: [0, 0, 0], max: [LX, 3, LZ] };
  const vopts = { bounds, width: 520, height: 300, dir: [0.35, 0.75, 1.0] };
  savePng(new URL(`./img/t1/view-${tag}.png`, import.meta.url).pathname, renderView(sim, vopts));
  savePng(new URL(`./img/t1/view-${regName}-base.png`, import.meta.url).pathname, renderView(base, vopts));
}
