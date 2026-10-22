// Air opening angle at the A|B junction of pair-diff from circle fits to each cap (labels).
import { readFileSync, writeFileSync } from 'node:fs';
import { fitCircle } from '../../look/src/lm.mjs';
const V = new URL('..', import.meta.url).pathname;
const lines = ['Air opening angle at the A|B junction of pair-diff (top profile on labels, plane z = 0.5), circle fit to each cap over |x - seam| in [0.03, 0.55]; equal double bubble, all tensions 1: theory 120 deg'];
for (const [R, N] of [['FREE', 16], ['FREE', 24], ['CAGE-0.25', 16], ['CAGE-0.25', 24], ['FINITE-4', 16], ['FINITE-4', 24], ['FID-0.15', 16], ['FID-0.15', 24], ['C15-V0', 24]]) {
  const d = JSON.parse(readFileSync(`${V}res/seams-${R}-g1@n${N}.json`, 'utf8')).runs['pair-diff'];
  const prof = d.lab.profile;
  const res = [];
  for (const [lo, hi, sgn] of [[-0.55, -0.03, -1], [0.03, 0.55, 1]]) {
    const pts = prof.filter(([x]) => x >= lo && x <= hi);
    const f = fitCircle(pts);
    if (!f) { res.push({ phi: 0, R: Infinity, rms: 0 }); continue; }
    const s = Math.sqrt(Math.max(f.R * f.R - f.cx * f.cx, 1e-12));
    const dydx = f.cx / s; // upper arc y = cy + sqrt(R^2 - (x - cx)^2), slope at x = 0
    res.push({ phi: (Math.atan(sgn * dydx) * 180) / Math.PI, R: f.R, rms: f.rms });
  }
  const top0 = prof.find(([x]) => Math.abs(x) < 0.05)[1];
  lines.push(`${R} n${N}: flank rises ${res[0].phi.toFixed(1)} / ${res[1].phi.toFixed(1)} deg, opening ${(180 - res[0].phi - res[1].phi).toFixed(1)} deg, cap R ${res[0].R.toFixed(3)} / ${res[1].R.toFixed(3)} (rms ${res[0].rms.toFixed(3)}), top next to the seam ${top0}`);
}
writeFileSync(`${V}res/pairdiff-circlefit.txt`, lines.join('\n') + '\n');
console.log(lines.join('\n'));
