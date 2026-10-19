// Cross-section of a world along x at z = zc: surface height (topmost
// up-facing triangle) every 1/16 block; reports the 10–90 % width of a step
// of height 1, its maximum slope, overshoot, and prints a coarse profile.
//   node work/gh/profile.mjs <world> v1,v2,… [--z 15.5] [--x0 10 --x1 22] [--lo 6 --hi 7]
import * as core from '../../harness/core.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { VARIANTS } from './variants.mjs';
import { WORLDS } from './worlds.mjs';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const w = WORLDS[args[0]];
const zc = opt('--z', 15.5), x0 = opt('--x0', 10), x1 = opt('--x1', 22), lo = opt('--lo', 6), hi = opt('--hi', 7);
for (const n of args[1].split(',')) {
  const v = VARIANTS[n];
  const region = core.buildRegion(w.cell, v.apron ?? 10);
  const mesh = core.decodeMesh(v.raw(region));
  const S = 16;
  const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S });
  const j = Math.floor(zc * S);
  const xs = [], hs = [];
  for (let i = Math.floor(x0 * S); i < x1 * S; i++) { xs.push((i + 0.5) / S); hs.push(img.top[j * img.W + i]); }
  const f10 = lo + 0.1 * (hi - lo), f90 = lo + 0.9 * (hi - lo);
  let a = null, b = null, maxSlope = 0, mx = -Infinity, mn = Infinity;
  for (let k = 0; k < hs.length; k++) {
    if (a === null && hs[k] >= f10) a = xs[k];
    if (b === null && hs[k] >= f90) b = xs[k];
    if (k > 0) maxSlope = Math.max(maxSlope, Math.atan(Math.abs(hs[k] - hs[k - 1]) * S) * 180 / Math.PI);
    mx = Math.max(mx, hs[k]); mn = Math.min(mn, hs[k]);
  }
  const coarse = [];
  for (let k = 0; k < hs.length; k += S / 2) coarse.push(hs[k].toFixed(2));
  console.log(`${n.padEnd(14)} 10–90% ${a?.toFixed(2)}→${b?.toFixed(2)} width ${(b - a).toFixed(2)}  max slope ${maxSlope.toFixed(0)}°  min ${mn.toFixed(3)} max ${mx.toFixed(3)}`);
  console.log(`${''.padEnd(14)} ${coarse.join(' ')}`);
}
