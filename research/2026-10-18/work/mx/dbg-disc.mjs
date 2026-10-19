import { reconstruct } from './contour.mjs';
const c = [16.13, 16.37], r = Number(process.argv[2] ?? 7.6);
const plan = (x, z) => (Math.hypot(x + 0.5 - c[0], z + 0.5 - c[1]) < r ? 3 : 1);
const S = 40;
const img = new Int8Array(S * S);
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) img[j * S + i] = plan(i - 4, j - 4);
for (const est of (process.env.ESTS ?? 'mlaa,tls,quad,hybrid').split(',')) {
  const debug = [];
  reconstruct(img, S, { est, cornerRun: 3, w: 0.05, hq: Number(process.env.HQ ?? 6), debug });
  // ideal τ: circle crossing along the dual edge
  const errs = [];
  for (const d of debug) {
    const [mx, my] = [d.mid[0] - 4, d.mid[1] - 4];
    // solve |m + t n − c| = r for t near 0
    const px = mx - c[0], py = my - c[1];
    const B = px * d.n[0] + py * d.n[1], C = px * px + py * py - r * r;
    const disc = B * B - C;
    if (disc < 0) continue;
    const t1 = -B + Math.sqrt(disc), t2 = -B - Math.sqrt(disc);
    const t = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
    errs.push({ e: d.tau - t, ideal: t, tau: d.tau, mid: [mx, my] });
  }
  const rms = Math.sqrt(errs.reduce((a, x) => a + x.e * x.e, 0) / errs.length);
  const mean = errs.reduce((a, x) => a + x.e, 0) / errs.length;
  const idealRange = Math.max(...errs.map((x) => Math.abs(x.ideal)));
  console.log(est.padEnd(7), 'cracks', errs.length, 'tau err rms', rms.toFixed(3), 'mean', mean.toFixed(3), 'max|ideal τ|', idealRange.toFixed(3));
  if (process.argv[3] === est) for (const x of errs.slice(0, 40)) console.log(x.mid.map((v) => v.toFixed(1)).join(','), 'ideal', x.ideal.toFixed(2), 'got', x.tau.toFixed(2));
}
