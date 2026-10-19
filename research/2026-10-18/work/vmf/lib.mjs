// vmf review helpers: approach loading, plan raster with triangle ids,
// side-by-side PNG composition, per-material area/connectivity metrics.
// Copies the harness's rasteriser pattern (harness/raster.mjs) read-only.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { PALETTE, renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
export { core, renderShaded, writePng, PALETTE };

export const ROOT = resolve(import.meta.dirname, '../..');
export async function loadApproach(p) {
  return import(pathToFileURL(resolve(ROOT, p)).href);
}

/** Plan raster like harness rasterTopDown, plus the triangle id per sample. */
export function planRaster(mesh, { x0 = 0, z0 = 0, w = 32, h = 32, S = 32, fragment = null } = {}) {
  const W = Math.round(w * S), H = Math.round(h * S);
  const mat = new Uint8Array(W * H);
  const tid = new Int32Array(W * H).fill(-1);
  const top = new Float64Array(W * H).fill(-Infinity);
  const { pos, tri, T } = mesh;
  const dim = mesh.attrDim ?? 0;
  const att = mesh.attrs;
  const tmp = new Float64Array(Math.max(1, dim));
  const info = { t: 0, a: 0, b: 0, c: 0, quad: 0, w: [0, 0, 0], x: 0, y: 0, z: 0, ownMat: 0 };
  const JX = 1.3e-7, JZ = 0.7e-7;
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
    const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (area >= -1e-12) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) * S - 0.5));
    const i1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx, cx) - x0) * S - 0.5));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) * S - 0.5));
    const j1 = Math.min(H - 1, Math.ceil((Math.max(az, bz, cz) - z0) * S - 0.5));
    for (let j = j0; j <= j1; j++) {
      const pz = z0 + (j + 0.5) / S + JZ;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) / S + JX;
        const w0 = ((bx - px) * (cz - pz) - (bz - pz) * (cx - px)) / area;
        const w1 = ((cx - px) * (az - pz) - (cz - pz) * (ax - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const y = w0 * ay + w1 * by + w2 * cy;
        const k = j * W + i;
        if (y <= top[k]) continue;
        top[k] = y;
        tid[k] = t;
        if (fragment) {
          for (let d = 0; d < dim; d++) tmp[d] = w0 * att[a * dim + d] + w1 * att[b * dim + d] + w2 * att[c * dim + d];
          info.t = t; info.a = a; info.b = b; info.c = c; info.quad = mesh.triQuad[t];
          info.w[0] = w0; info.w[1] = w1; info.w[2] = w2; info.x = px; info.y = y; info.z = pz; info.ownMat = mesh.mat[a];
          mat[k] = fragment(tmp, info, null);
        } else mat[k] = mesh.mat[a];
      }
    }
  }
  return { W, H, S, x0, z0, w, h, mat, tid, top };
}

/** RGB of a plan raster; optional block grid and triangle-edge overlay. */
export function planRgb(img, { grid = true, edges = false } = {}) {
  const { W, H, S, mat, tid, x0, z0 } = img;
  const rgb = new Uint8Array(W * H * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const m = mat[k];
    const col = m === 0 ? [20, 20, 20] : PALETTE[m];
    const gx = (i / S + x0), gz = (j / S + z0);
    const onGrid = grid && (Math.abs(gx - Math.round(gx)) < 0.5 / S || Math.abs(gz - Math.round(gz)) < 0.5 / S);
    let f = onGrid ? 0.8 : 1;
    if (edges && ((i + 1 < W && tid[k + 1] !== tid[k]) || (j + 1 < H && tid[k + W] !== tid[k]))) f = 0.55;
    rgb[k * 3] = col[0] * f; rgb[k * 3 + 1] = col[1] * f; rgb[k * 3 + 2] = col[2] * f;
  }
  return { width: W, height: H, rgb };
}

/** Horizontal composition with a white gap. */
export function hcat(imgs, gap = 6) {
  const H = Math.max(...imgs.map((x) => x.height));
  const W = imgs.reduce((a, x) => a + x.width, 0) + gap * (imgs.length - 1);
  const rgb = new Uint8Array(W * H * 3).fill(255);
  let ox = 0;
  for (const im of imgs) {
    for (let j = 0; j < im.height; j++) for (let i = 0; i < im.width; i++) {
      const s = (j * im.width + i) * 3, d = (j * W + ox + i) * 3;
      rgb[d] = im.rgb[s]; rgb[d + 1] = im.rgb[s + 1]; rgb[d + 2] = im.rgb[s + 2];
    }
    ox += im.width + gap;
  }
  return { width: W, height: H, rgb };
}
export function vcat(imgs, gap = 6) {
  const W = Math.max(...imgs.map((x) => x.width));
  const H = imgs.reduce((a, x) => a + x.height, 0) + gap * (imgs.length - 1);
  const rgb = new Uint8Array(W * H * 3).fill(255);
  let oy = 0;
  for (const im of imgs) {
    for (let j = 0; j < im.height; j++) for (let i = 0; i < im.width; i++) {
      const s = (j * im.width + i) * 3, d = ((oy + j) * W + i) * 3;
      rgb[d] = im.rgb[s]; rgb[d + 1] = im.rgb[s + 1]; rgb[d + 2] = im.rgb[s + 2];
    }
    oy += im.height + gap;
  }
  return { width: W, height: H, rgb };
}
export const save = (file, im) => writePng(file, im.width, im.height, im.rgb);

/** Per-material displayed area (blocks²) and 4-connected parts inside a window [x0,z0,x1,z1]. */
export function matStats(img, win) {
  const { W, S, mat, x0, z0 } = img;
  const i0 = Math.round((win[0] - x0) * S), i1 = Math.round((win[2] - x0) * S);
  const j0 = Math.round((win[1] - z0) * S), j1 = Math.round((win[3] - z0) * S);
  const area = new Float64Array(8);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) area[mat[j * W + i]] += 1 / (S * S);
  const parts = new Int32Array(8), specks = new Int32Array(8);
  const seen = new Uint8Array(mat.length);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const k = j * W + i;
    if (seen[k]) continue;
    const m = mat[k];
    let size = 0;
    const st = [k];
    seen[k] = 1;
    while (st.length) {
      const q = st.pop();
      size++;
      const qi = q % W, qj = (q - qi) / W;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = qi + di, nj = qj + dj;
        if (ni < i0 || nj < j0 || ni >= i1 || nj >= j1) continue;
        const nk = nj * W + ni;
        if (!seen[nk] && mat[nk] === m) { seen[nk] = 1; st.push(nk); }
      }
    }
    if (size >= 0.01 * S * S) parts[m]++; else specks[m]++;
  }
  return { area: Array.from(area), parts: Array.from(parts), specks: Array.from(specks) };
}

/** Cell counts per material of a plan inside a window. */
export function planCounts(plan, win) {
  const c = new Array(8).fill(0);
  for (let z = win[1]; z < win[3]; z++) for (let x = win[0]; x < win[2]; x++) c[plan(x, z) & 0xff]++;
  return c;
}

/** Plan-cell 4-connected components per material inside a window (block topology). */
export function planParts(plan, win) {
  const w = win[2] - win[0], h = win[3] - win[1];
  const seen = new Uint8Array(w * h);
  const parts = new Array(8).fill(0);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (seen[j * w + i]) continue;
    const m = plan(i + win[0], j + win[1]) & 0xff;
    parts[m]++;
    const st = [[i, j]];
    seen[j * w + i] = 1;
    while (st.length) {
      const [a, b] = st.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = a + di, nj = b + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h || seen[nj * w + ni]) continue;
        if ((plan(ni + win[0], nj + win[1]) & 0xff) !== m) continue;
        seen[nj * w + ni] = 1;
        st.push([ni, nj]);
      }
    }
  }
  return parts;
}

/** Crop a plan raster rgb to a block window. */
export function cropRgb(im, S, x0, z0, win) {
  const i0 = Math.round((win[0] - x0) * S), j0 = Math.round((win[1] - z0) * S);
  const w = Math.round((win[2] - win[0]) * S), h = Math.round((win[3] - win[1]) * S);
  const rgb = new Uint8Array(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const s = ((j + j0) * im.width + i + i0) * 3, d = (j * w + i) * 3;
    rgb[d] = im.rgb[s]; rgb[d + 1] = im.rgb[s + 1]; rgb[d + 2] = im.rgb[s + 2];
  }
  return { width: w, height: h, rgb };
}
