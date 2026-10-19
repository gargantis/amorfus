// Split boundary deviation into jaggies (< ~1 block along the boundary) and
// shape (low-frequency): order boundary points along the ideal curve, smooth
// the signed distance with a ±0.5-block window, report std of the residual
// (jag) and of the smoothed curve (shape). Works on any material image.
import { boundaryPoints, idealDistance } from '../../harness/metrics.mjs';
export function jagMetrics(img, ideal, win = 0.5) {
  let pts = boundaryPoints(img, ideal.pair[0], ideal.pair[1]);
  if (ideal.window) { const [a, b, c, d] = ideal.window; pts = pts.filter((p) => p[0] >= a && p[0] <= c && p[1] >= b && p[1] <= d); }
  if (ideal.ray) { const { c, dir, min } = ideal.ray; pts = pts.filter((p) => (p[0] - c[0]) * Math.cos(dir) + (p[1] - c[1]) * Math.sin(dir) >= min); }
  // arc parameter along the ideal curve
  const sOf = (p) => {
    if (ideal.kind === 'disc') return Math.atan2(p[1] - ideal.c[1], p[0] - ideal.c[0]) * ideal.r;
    const t = ideal.theta ?? 0; const p0 = ideal.p0 ?? [0, 0];
    return (p[0] - p0[0]) * Math.cos(t) + (p[1] - p0[1]) * Math.sin(t);
  };
  const side = (p) => ideal.kind === 'band' ? Math.sign((p[0] - ideal.p0[0]) * -Math.sin(ideal.theta) + (p[1] - ideal.p0[1]) * Math.cos(ideal.theta)) : 1;
  const out = {};
  for (const sd of ideal.kind === 'band' ? [-1, 1] : [1]) {
    const arr = pts.filter((p) => side(p) === sd).map((p) => [sOf(p), idealDistance(ideal, p)]).sort((a, b) => a[0] - b[0]);
    if (arr.length < 5) continue;
    const n = arr.length;
    const sm = new Float64Array(n);
    let lo = 0, hi = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      while (hi < n && arr[hi][0] <= arr[i][0] + win) { sum += arr[hi][1]; hi++; }
      while (arr[lo][0] < arr[i][0] - win) { sum -= arr[lo][1]; lo++; }
      sm[i] = sum / (hi - lo);
    }
    const mean = arr.reduce((a, x) => a + x[1], 0) / n;
    let j2 = 0, s2 = 0, jmax = 0;
    for (let i = 0; i < n; i++) { const r = arr[i][1] - sm[i]; j2 += r * r; jmax = Math.max(jmax, Math.abs(r)); s2 += (sm[i] - mean) ** 2; }
    out[sd] = { jag: Math.sqrt(j2 / n), jagMax: jmax, shape: Math.sqrt(s2 / n), mean };
  }
  // combine sides: worst
  const vals = Object.values(out);
  return { jag: Math.max(...vals.map((v) => v.jag)), jagMax: Math.max(...vals.map((v) => v.jagMax)), shape: Math.max(...vals.map((v) => v.shape)), bandOffset: out[1] && out[-1] ? (out[1].mean - out[-1].mean) / 2 : null };
}
