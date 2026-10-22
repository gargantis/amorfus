// Renderers for bubble simulations (block coordinates, y up).
//  - renderView: perspective ray march of the smooth field D (D > 0 solid),
//    lit like the smoothing-study harness (Lambert sun + hemispheric
//    ambient, × a field AO), flat palette colours; 2×2 supersampling.
//  - renderSlice: an axis-aligned cross-section: each bubble's colour, films
//    between solid bubbles in black, the air surface in white, faint block grid.
// Both take a finished sim (mbo.mjs `simulate`) or anything with the same
// fields: { NX, NY, NZ, n, ox, oy, oz, D, Sall, phases[{mat, alive, box, val}] }.
import { writePng } from './png.mjs';
import { sampleGrid, samplePhase } from './mbo.mjs';

export const PALETTE = [
  [255, 0, 255], // air (never drawn)
  [96, 156, 62], // 1 grass
  [128, 90, 58], // 2 dirt
  [138, 138, 142], // 3 stone
  [222, 206, 146], // 4 sand
  [182, 138, 82], // 5 planks
  [168, 74, 58], // 6 brick  (bubble scenes: material A)
  [90, 90, 200], // 7 blue   (bubble scenes: material B)
];
export const A = 6, B = 7, C = 1, Dm = 4; // bubble-scene materials: red, blue, green, sand

const SUN = (() => { const l = Math.hypot(0.5, 0.8, 0.3); return [0.5 / l, 0.8 / l, 0.3 / l]; })();
const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];

/** Block-space bounds of the solid part (D > 0) of a sim. */
export function solidBounds(sim) {
  const { NX, NY, NZ, n, ox, oy, oz, D } = sim;
  let a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (D[(k * NY + j) * NX + i] <= 0) continue;
    const p = [ox + (i + 0.5) / n, oy + (j + 0.5) / n, oz + (k + 0.5) / n];
    for (let t = 0; t < 3; t++) { a[t] = Math.min(a[t], p[t]); b[t] = Math.max(b[t], p[t]); }
  }
  return { min: a, max: b };
}

function phaseColour(sim, p, tint) {
  const P = sim.phases[p];
  const base = PALETTE[P.mat] ?? [255, 0, 255];
  if (!tint) return base;
  // separate clusters of one material get a slightly different shade
  let rank = 0;
  for (let q = 1; q < p; q++) if (sim.phases[q].alive && sim.phases[q].mat === P.mat) rank++;
  const f = [1, 0.82, 1.15, 0.7, 1.25][rank % 5];
  return base.map((v) => Math.min(255, v * f));
}

/** Least-cost solid phase at a point (no D test). */
function ownerAt(sim, x, y, z) {
  let best = 0, bv = Infinity;
  for (let p = 1; p < sim.phases.length; p++) {
    const P = sim.phases[p];
    if (!P.alive || !P.val) continue;
    const v = samplePhase(sim, p, x, y, z);
    if (v < bv) { bv = v; best = p; }
  }
  return best;
}

export function renderView(sim, {
  width = 400, height = 300, ss = 2, dir = [1, 0.9, 1.35], fovDeg = 30, eye = null, target = null,
  fit = 1.12, bg = [[176, 202, 230], [226, 234, 242]], tint = true, ao = true, bounds = null,
} = {}) {
  const { NX, NY, NZ, n, ox, oy, oz } = sim;
  const sb = bounds ?? solidBounds(sim); // pass the blocks' bounds to keep one scale across runs
  const ctr = target ?? sb.min.map((v, t) => 0.5 * (v + sb.max[t]));
  const rad = Math.max(0.6, 0.5 * Math.hypot(sb.max[0] - sb.min[0], sb.max[1] - sb.min[1], sb.max[2] - sb.min[2]));
  const tanH = Math.tan((fovDeg * Math.PI) / 360);
  const dirN = norm(dir);
  const E = eye ?? ctr.map((v, t) => v + dirN[t] * (rad * fit) / Math.sin(Math.atan(tanH)));
  const f = norm([ctr[0] - E[0], ctr[1] - E[1], ctr[2] - E[2]]);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const W = width * ss, H = height * ss, aspect = W / H;
  const lo = [ox, oy, oz], hi = [ox + NX / n, oy + NY / n, oz + NZ / n];
  const D = sim.D;
  const Dat = (x, y, z) => sampleGrid(sim, D, x, y, z);
  const occ = (x, y, z) => sampleGrid(sim, sim.Sall, x, y, z);
  const L = 0.6 * n; // Lipschitz bound of D per block (conservative)
  const h0 = 0.5 / n;
  const acc = new Float64Array(width * height * 3);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const sx = ((i + 0.5) / W * 2 - 1) * tanH * aspect, sy = (1 - (j + 0.5) / H * 2) * tanH;
      const d = norm([f[0] + sx * r[0] + sy * u[0], f[1] + sx * r[1] + sy * u[1], f[2] + sx * r[2] + sy * u[2]]);
      // ray vs domain box
      let t0 = 0, t1 = Infinity;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-12) { if (E[a] < lo[a] || E[a] > hi[a]) { t0 = 1; t1 = 0; } continue; }
        let ta = (lo[a] - E[a]) / d[a], tb = (hi[a] - E[a]) / d[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      }
      const t = (j / H);
      let col = [bg[0][0] * (1 - t) + bg[1][0] * t, bg[0][1] * (1 - t) + bg[1][1] * t, bg[0][2] * (1 - t) + bg[1][2] * t];
      if (t0 < t1) {
        let tc = t0 + 1e-6, prevT = tc, prevD = Dat(E[0] + d[0] * tc, E[1] + d[1] * tc, E[2] + d[2] * tc);
        let hit = -1;
        while (tc < t1) {
          const step = Math.max(h0, Math.min(4 * h0, -prevD / L));
          tc += step;
          const v = Dat(E[0] + d[0] * tc, E[1] + d[1] * tc, E[2] + d[2] * tc);
          if (v > 0) {
            let a = prevT, b = tc;
            for (let it = 0; it < 10; it++) {
              const m = 0.5 * (a + b);
              if (Dat(E[0] + d[0] * m, E[1] + d[1] * m, E[2] + d[2] * m) > 0) b = m; else a = m;
            }
            hit = 0.5 * (a + b);
            break;
          }
          prevT = tc; prevD = v;
        }
        if (hit >= 0) {
          const px = E[0] + d[0] * hit, py = E[1] + d[1] * hit, pz = E[2] + d[2] * hit;
          const e = 0.6 / n;
          let nx = Dat(px - e, py, pz) - Dat(px + e, py, pz);
          let ny = Dat(px, py - e, pz) - Dat(px, py + e, pz);
          let nz = Dat(px, py, pz - e) - Dat(px, py, pz + e);
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          const q = 0.35 / n;
          const p = ownerAt(sim, px - nx * q, py - ny * q, pz - nz * q);
          const base = p ? phaseColour(sim, p, tint) : [255, 0, 255];
          let aov = 1;
          if (ao) {
            const o1 = occ(px + nx * 0.4, py + ny * 0.4, pz + nz * 0.4);
            const o2 = occ(px + nx * 0.9, py + ny * 0.9, pz + nz * 0.9);
            aov = Math.min(1, Math.max(0.5, 1 - 0.55 * (o1 + o2)));
          }
          const sun = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
          const light = (0.9 * sun + 0.35 + 0.25 * (ny * 0.5 + 0.5)) * aov;
          col = base.map((c) => Math.min(255, c * light));
        }
      }
      const k = (Math.floor(j / ss) * width + Math.floor(i / ss)) * 3;
      acc[k] += col[0]; acc[k + 1] += col[1]; acc[k + 2] += col[2];
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let k = 0; k < rgb.length; k++) rgb[k] = Math.round(acc[k] / (ss * ss));
  return { width, height, rgb };
}

/** Cross-section on the plane `axis` = `at` (block coords). `ppb` pixels
 *  per block. Returns {width, height, rgb}; image x/y follow the two other
 *  axes (for axis 1, the image is x right, z down — a plan view). */
export function renderSlice(sim, { axis = 2, at = null, ppb = 40, grid = true, tint = true, ss = 2 } = {}) {
  const { NX, NY, NZ, n, ox, oy, oz } = sim;
  const lo = [ox, oy, oz], ext = [NX / n, NY / n, NZ / n];
  const ua = axis === 0 ? 2 : 0, va = axis === 1 ? 2 : 1;
  const cut = at ?? lo[axis] + ext[axis] / 2;
  const w = Math.round(ext[ua] * ppb), h = Math.round(ext[va] * ppb);
  const W = w * ss, H = h * ss;
  const lab = new Int32Array(W * H);
  const pt = [0, 0, 0];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    pt[axis] = cut;
    pt[ua] = lo[ua] + (i + 0.5) / (ppb * ss);
    pt[va] = va === 1 ? lo[va] + ext[va] - (j + 0.5) / (ppb * ss) : lo[va] + (j + 0.5) / (ppb * ss);
    const Dv = sampleGrid(sim, sim.D, pt[0], pt[1], pt[2]);
    lab[j * W + i] = Dv > 0 ? ownerAt(sim, pt[0], pt[1], pt[2]) : 0;
  }
  const big = new Float64Array(W * H * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const L = lab[j * W + i];
    let col = L ? phaseColour(sim, L, tint) : [26, 28, 34];
    const R = i + 1 < W ? lab[j * W + i + 1] : L, Dn = j + 1 < H ? lab[(j + 1) * W + i] : L;
    const Lf = i > 0 ? lab[j * W + i - 1] : L, Up = j > 0 ? lab[(j - 1) * W + i] : L;
    const nb = [R, Dn, Lf, Up];
    if (L && nb.some((q) => q && q !== L)) col = [0, 0, 0]; // film between bubbles
    else if (nb.some((q) => q !== L)) col = [240, 240, 240]; // surface against air
    else if (grid) {
      const bu = lo[ua] + (i + 0.5) / (ppb * ss), bv = lo[va] + (j + 0.5) / (ppb * ss);
      const nearU = Math.abs(bu - Math.round(bu)) < 0.5 / (ppb), nearV = Math.abs(bv - Math.round(bv)) < 0.5 / (ppb);
      if (nearU || nearV) col = L ? col.map((c) => c * 0.82) : [52, 54, 62];
    }
    const k = (j * W + i) * 3;
    big[k] = col[0]; big[k + 1] = col[1]; big[k + 2] = col[2];
  }
  const rgb = new Uint8Array(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let r0 = 0, g0 = 0, b0 = 0;
    for (let dj = 0; dj < ss; dj++) for (let di = 0; di < ss; di++) {
      const k = ((j * ss + dj) * W + (i * ss + di)) * 3;
      r0 += big[k]; g0 += big[k + 1]; b0 += big[k + 2];
    }
    const k = (j * w + i) * 3, q = ss * ss;
    rgb[k] = r0 / q; rgb[k + 1] = g0 / q; rgb[k + 2] = b0 / q;
  }
  return { width: w, height: h, rgb };
}

/** Initial blocks as a slice image (same layout as renderSlice). */
export function blocksSlice(blocks, sim, { axis = 2, at = null, ppb = 40 } = {}) {
  const { NX, NY, NZ, n, ox, oy, oz } = sim;
  const lo = [ox, oy, oz], ext = [NX / n, NY / n, NZ / n];
  const ua = axis === 0 ? 2 : 0, va = axis === 1 ? 2 : 1;
  const cut = at ?? lo[axis] + ext[axis] / 2;
  const w = Math.round(ext[ua] * ppb), h = Math.round(ext[va] * ppb);
  const map = new Map(blocks.map((b) => [`${b[0]},${b[1]},${b[2]}`, b[3]]));
  const rgb = new Uint8Array(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const pt = [0, 0, 0];
    pt[axis] = cut;
    pt[ua] = lo[ua] + (i + 0.5) / ppb;
    pt[va] = va === 1 ? lo[va] + ext[va] - (j + 0.5) / ppb : lo[va] + (j + 0.5) / ppb;
    const m = map.get(`${Math.floor(pt[0])},${Math.floor(pt[1])},${sim.NZ > 1 ? Math.floor(pt[2]) : blocks[0][2]}`) ?? 0;
    let col = m ? PALETTE[m] : [26, 28, 34];
    const nearU = Math.abs(pt[ua] - Math.round(pt[ua])) < 0.6 / ppb, nearV = Math.abs(pt[va] - Math.round(pt[va])) < 0.6 / ppb;
    if (nearU || nearV) col = m ? col.map((c) => c * 0.6) : [52, 54, 62];
    const k = (j * w + i) * 3;
    rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2];
  }
  return { width: w, height: h, rgb };
}

export function savePng(path, img) { writePng(path, img.width, img.height, img.rgb); }

