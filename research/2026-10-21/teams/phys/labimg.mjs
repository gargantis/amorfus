// Label images (team phys): draw a 2D label image (labtools.labelImage) as
// a PNG, one flat colour per phase (palette by material), black films,
// optional overlay polylines (exact solutions) and points.
import { writePng } from '../../lib/png.mjs';
import { PALETTE } from '../../lib/render.mjs';

export function drawLabels(sim, img, { scale = 8, overlays = [], points = [], crop = null } = {}) {
  const { w, h, lab, h0, u0, v0 } = img;
  let [iu0, iv0, iu1, iv1] = crop ? [Math.max(0, Math.floor((crop[0] - u0) / h0)), Math.max(0, Math.floor((crop[1] - v0) / h0)), Math.min(w, Math.ceil((crop[2] - u0) / h0)), Math.min(h, Math.ceil((crop[3] - v0) / h0))] : [0, 0, w, h];
  const W = (iu1 - iu0) * scale, H = (iv1 - iv0) * scale;
  const rgb = new Uint8Array(W * H * 3);
  const shade = (p) => {
    if (!p) return [26, 28, 34];
    const P = sim.phases[p];
    const base = PALETTE[P.mat] ?? [255, 0, 255];
    let rank = 0;
    for (let q = 1; q < p; q++) if (sim.phases[q].alive && sim.phases[q].mat === P.mat) rank++;
    const f = [1, 0.75, 1.2, 0.6, 1.3][rank % 5];
    return base.map((v) => Math.min(255, v * f));
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = iu0 + Math.floor(x / scale), v = iv1 - 1 - Math.floor(y / scale); // v up
    const l = lab[v * w + u];
    let col = shade(l);
    // block grid
    const bu = u0 + (u + (x % scale + 0.5) / scale) * h0, bv = v0 + (v + 1 - (y % scale + 0.5) / scale) * h0;
    if (Math.abs(bu - Math.round(bu)) < 0.5 * h0 / scale * 1.5 || Math.abs(bv - Math.round(bv)) < 0.5 * h0 / scale * 1.5) col = col.map((c) => c * 0.7);
    const k = (y * W + x) * 3;
    rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2];
  }
  const toPx = (p) => [((p[0] - u0) / h0 - iu0) * scale, (iv1 - (p[1] - v0) / h0) * scale];
  const dot = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const k = (y * W + x) * 3; rgb[k] = c[0]; rgb[k + 1] = c[1]; rgb[k + 2] = c[2]; };
  for (const { pts, color = [255, 255, 255] } of overlays) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = toPx(pts[i]), b = toPx(pts[i + 1]);
      const L = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let t = 0; t <= L; t++) dot(a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L, color);
    }
  }
  for (const { p, color = [255, 255, 0], r = 2 } of points) {
    const [x, y] = toPx(p);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) dot(x + dx, y + dy, color);
  }
  return { width: W, height: H, rgb };
}
export const savePng = (path, im) => writePng(path, im.width, im.height, im.rgb);
