// v-table: chart of res/round2d.json (x: fillet radius r 0..2 blocks; y: symmetric
// mean distance 0..0.04 block). black = cube, magenta = on-surface vertices,
// green = best edge offset; grid lines every 0.25 block in x and 0.01 in y.
import { readFileSync } from 'node:fs';
import { savePng } from '../../../lib/render.mjs';
const R = JSON.parse(readFileSync(new URL('../res/round2d.json', import.meta.url), 'utf8')).rows.filter((r) => r.r <= 2);
const W = 480, H = 300, X = (r) => 30 + r / 2 * (W - 40), Y = (e) => H - 20 - e / 0.04 * (H - 30);
const rgb = new Uint8Array(W * H * 3).fill(255);
const plot = (x, y, c, rad = 1) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const xi = Math.round(x + dx), yi = Math.round(y + dy); if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue; const k = 3 * (yi * W + xi); rgb[k] = c[0]; rgb[k + 1] = c[1]; rgb[k + 2] = c[2]; } };
const line = (a, b, c, rad) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1; for (let t = 0; t <= n; t++) plot(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n, c, rad); };
for (let r = 0; r <= 2.001; r += 0.25) line([X(r), Y(0)], [X(r), Y(0.04)], r % 1 === 0 ? [150, 150, 150] : [220, 220, 220], 0);
for (let e = 0; e <= 0.0401; e += 0.01) line([X(0), Y(e)], [X(2), Y(e)], e === 0 ? [120, 120, 120] : [220, 220, 220], 0);
for (const [key, col] of [['cube', [0, 0, 0]], ['onSurface', [200, 0, 160]], ['bestAll', [0, 160, 40]]]) {
  for (let i = 0; i + 1 < R.length; i++) line([X(R[i].r), Y(Math.min(0.04, R[i][key]))], [X(R[i + 1].r), Y(Math.min(0.04, R[i + 1][key]))], col, 1);
}
savePng(new URL('../img/round2d-chart.png', import.meta.url).pathname, { width: W, height: H, rgb });
