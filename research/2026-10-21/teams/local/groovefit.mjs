// Check the straight-seam groove against an analytic model (no dynamics):
// D0 = Sall + max(uA, uB) - 1 for a flat top with a vertical A|B seam, the
// render blur being a Gaussian of std renderS = 0.125 block.
//  (1) continuous: depth(x) = s * PhiInv(1 / (1 + Phi(|x| / s)))
//  (2) discrete: the engine's blur (gaussKernel(1.5 sub-cells), n = 12) on a
//      2D cross-section, sampled bilinearly like sampleGrid.
import { readFileSync, writeFileSync } from 'node:fs';
import { gaussKernel, blur3 } from './lib/mbo-box.mjs';
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
const PhiInv = (p) => { let lo = -8, hi = 8; for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); if (Phi(m) < p) lo = m; else hi = m; } return 0.5 * (lo + hi); };
const s = 0.125;
const cont = (x) => s * PhiInv(1 / (1 + Phi(Math.abs(x) / s)));
// discrete
const n = 12, W = 4 * n, H = 4 * n; // x in [-2,2], y in [0,4] with top at y = 2
const uA = new Float64Array(W * H), uB = new Float64Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = -2 + (i + 0.5) / n, y = (j + 0.5) / n; if (y < 2) (x < 0 ? uA : uB)[j * W + i] = 1; }
const ker = gaussKernel(0.125 * n);
blur3(uA, W, H, 1, ker); blur3(uB, W, H, 1, ker);
const D = new Float64Array(W * H); for (let c = 0; c < W * H; c++) D[c] = uA[c] + uB[c] + Math.max(uA[c], uB[c]) - 1;
const samp = (x, y) => { let gx = (x + 2) * n - 0.5, gy = y * n - 0.5; const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j; const at = (a, b) => D[b * W + a]; return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy; };
const top = (x) => { let a = 1.5, b = 2.5; for (let k = 0; k < 60; k++) { const m = 0.5 * (a + b); if (samp(x, m) > 0) a = m; else b = m; } return 0.5 * (a + b); };
const meas = JSON.parse(readFileSync(new URL('./res/t2/seam-FID-0.15.json', import.meta.url))).runs['seam-a5b5L4'].m0;
const rows = [];
let maxErrDisc = 0, maxErrCont = 0;
meas.grooveX.forEach((x, i) => {
  if (Math.abs(x) > 0.5) return;
  const m = meas.groove[i] - 2, d = top(x) - 2, c = -cont(x);
  maxErrDisc = Math.max(maxErrDisc, Math.abs(m - d)); maxErrCont = Math.max(maxErrCont, Math.abs(m - c));
  rows.push({ x, measured: +m.toFixed(5), discreteModel: +d.toFixed(5), continuousModel: +c.toFixed(5) });
});
const out = { note: 'groove depth below the flat top (blocks), FID-0.15 seam-a5b5L4, local field D0, n = 12', maxErrDiscrete: +maxErrDisc.toExponential(3), maxErrContinuous: +maxErrCont.toExponential(3), contDepthAt0: +cont(0).toFixed(5), rows };
writeFileSync(new URL('./res/groovefit.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('max |measured - discrete model|', out.maxErrDiscrete, ' max |measured - continuous model|', out.maxErrContinuous, ' continuous depth at x=0', out.contDepthAt0);
for (const r of rows) console.log(r.x.toFixed(2), r.measured, r.discreteModel, r.continuousModel);
