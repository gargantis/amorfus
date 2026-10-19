import { arcLP } from './lp.mjs';
import { arcLP4 } from './lp4.mjs';
let seed = 99;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
let worst = 0, n = 0, nulls = 0;
const T = [0, 0];
for (let t = 0; t < 20000; t++) {
  // random circle boundary sampled on pixel centres near it
  const R = 1 + rnd() * 12, cx = (rnd() - 0.5) * 2 * R, cz = R + (rnd() - 0.5);
  const inP = [], outP = [];
  for (let z = -6; z < 6; z++) for (let x = -6; x < 6; x++) {
    const px = x + 0.5, pz = z + 0.5;
    const d = Math.hypot(px - cx, pz - cz) - R + (rnd() < 0.1 ? (rnd() - 0.5) : 0);
    if (Math.abs(d) < 1.2) (d < 0 ? outP : inP).push(px, pz);
  }
  if (inP.length < 4 || outP.length < 4) continue;
  const a = Math.random() * 0;
  const t0x = 1, t0z = 0;
  const opt = { K: 2 };
  let s = performance.now();
  const r1 = arcLP(inP, outP, 0, 0, -t0z, t0x, t0x, t0z, opt);
  T[0] += performance.now() - s; s = performance.now();
  const r2 = arcLP4(inP, outP, 0, 0, -t0z, t0x, t0x, t0z, opt);
  T[1] += performance.now() - s;
  if (!r1 || !r2) { nulls++; continue; }
  n++;
  worst = Math.max(worst, Math.abs(r1.t - r2.t));
}
import { STATS } from "./lp4.mjs"; console.log("iters/call", (STATS.iters / STATS.calls).toFixed(1));
console.log(`cases ${n}, nulls ${nulls}, worst |t1 - t2| = ${worst.toExponential(2)}; dense ${T[0].toFixed(0)} ms, active-set ${T[1].toFixed(0)} ms`);
