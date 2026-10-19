// Two software rasterisers over a plain mesh:
//  - rasterTopDown: orthographic plan view, the topmost up-facing triangle
//    per sample. Gives a material image for boundary metrics.
//  - renderShaded: perspective view with z-buffer, the production
//    lighting model (Lambert sun + hemispheric ambient, × AO), flat
//    palette colours, 3×3 supersampling so pixel aliasing does not hide
//    or fake the jaggedness under study.
// Both accept an optional fragment(attrs, info) → material id, receiving
// per-vertex `mesh.attrs` (dim `mesh.attrDim`) interpolated linearly
// within each triangle — the GPU's default interpolation — and `info`
// with the triangle, its first (provoking) vertex and quad index.
import { faceNormal, vertexIsFlat } from './core.mjs';

export const PALETTE = [
  [255, 0, 255], // air (never drawn)
  [96, 156, 62], // grass
  [128, 90, 58], // dirt
  [138, 138, 142], // stone
  [222, 206, 146], // sand
  [182, 138, 82], // planks
  [168, 74, 58], // brick
  [90, 90, 200], // reserved7
];

export function rasterTopDown(mesh, { x0 = 0, z0 = 0, w = 32, h = 32, S = 32, fragment = null, scene = null } = {}) {
  const W = w * S, H = h * S;
  const mat = new Uint8Array(W * H);
  const top = new Float64Array(W * H).fill(-Infinity);
  const { pos, tri, T } = mesh;
  const dim = mesh.attrDim ?? 0;
  const att = mesh.attrs;
  const tmp = new Float64Array(Math.max(1, dim));
  const info = { t: 0, a: 0, b: 0, c: 0, quad: 0, w: [0, 0, 0], x: 0, y: 0, z: 0, ownMat: 0 };
  const JX = 1.3e-7, JZ = 0.7e-7; // keep samples off exact edges
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
    const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax); // = −(face normal).y·2
    if (area >= -1e-12) continue; // only up-facing triangles
    const minx = Math.min(ax, bx, cx), maxx = Math.max(ax, bx, cx);
    const minz = Math.min(az, bz, cz), maxz = Math.max(az, bz, cz);
    const i0 = Math.max(0, Math.floor((minx - x0) * S - 0.5));
    const i1 = Math.min(W - 1, Math.ceil((maxx - x0) * S - 0.5));
    const j0 = Math.max(0, Math.floor((minz - z0) * S - 0.5));
    const j1 = Math.min(H - 1, Math.ceil((maxz - z0) * S - 0.5));
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
        if (fragment) {
          for (let d = 0; d < dim; d++) tmp[d] = w0 * att[a * dim + d] + w1 * att[b * dim + d] + w2 * att[c * dim + d];
          info.t = t; info.a = a; info.b = b; info.c = c; info.quad = mesh.triQuad[t];
          info.w[0] = w0; info.w[1] = w1; info.w[2] = w2; info.x = px; info.y = y; info.z = pz; info.ownMat = mesh.mat[a];
          mat[k] = fragment(tmp, info, scene);
        } else {
          mat[k] = mesh.mat[a];
        }
      }
    }
  }
  return { W, H, S, x0, z0, w, h, mat, top };
}

/** Material image → RGB with a faint block grid. */
export function materialImageRgb(img, { grid = true, crop = null } = {}) {
  const { W, H, S, mat } = img;
  const [ci0, cj0, ci1, cj1] = crop ? crop.map((v) => v * S) : [0, 0, W, H];
  const w = ci1 - ci0, h = cj1 - cj0;
  const rgb = new Uint8Array(w * h * 3);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const gi = i + ci0, gj = j + cj0;
      const m = mat[gj * W + gi];
      const col = m === 0 ? [20, 20, 20] : PALETTE[m];
      const onGrid = grid && (gi % S === 0 || gj % S === 0);
      const f = onGrid ? 0.8 : 1;
      rgb[(j * w + i) * 3] = col[0] * f;
      rgb[(j * w + i) * 3 + 1] = col[1] * f;
      rgb[(j * w + i) * 3 + 2] = col[2] * f;
    }
  }
  return { width: w, height: h, rgb };
}

const SUN = (() => { const l = Math.hypot(0.5, 0.8, 0.3); return [0.5 / l, 0.8 / l, 0.3 / l]; })();

export function renderShaded(mesh, {
  width = 480, height = 320, ss = 3, eye, target, fovDeg = 50, fragment = null, scene = null,
  flatShading = false, bg = [168, 196, 226],
} = {}) {
  const W = width * ss, H = height * ss;
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
  const f = norm(sub(target, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const tanH = Math.tan((fovDeg * Math.PI) / 360);
  const aspect = W / H;
  const { pos, nrm, tri, T, ao } = mesh;
  const V = mesh.V;
  const sx = new Float64Array(V), sy = new Float64Array(V), sz = new Float64Array(V);
  for (let v = 0; v < V; v++) {
    const dx = pos[v * 3] - eye[0], dy = pos[v * 3 + 1] - eye[1], dz = pos[v * 3 + 2] - eye[2];
    const cxv = dx * r[0] + dy * r[1] + dz * r[2];
    const cyv = dx * u[0] + dy * u[1] + dz * u[2];
    const czv = dx * f[0] + dy * f[1] + dz * f[2];
    sz[v] = czv;
    sx[v] = (cxv / (czv * tanH * aspect) * 0.5 + 0.5) * W;
    sy[v] = (-cyv / (czv * tanH) * 0.5 + 0.5) * H;
  }
  const zbuf = new Float64Array(W * H).fill(Infinity);
  const acc = new Float64Array(W * H * 3);
  for (let k = 0; k < W * H; k++) { acc[k * 3] = bg[0]; acc[k * 3 + 1] = bg[1]; acc[k * 3 + 2] = bg[2]; }
  const dim = mesh.attrDim ?? 0;
  const att = mesh.attrs;
  const tmp = new Float64Array(Math.max(1, dim));
  const fn = [0, 0, 0, 0];
  const info = { t: 0, a: 0, b: 0, c: 0, quad: 0, w: [0, 0, 0], x: 0, y: 0, z: 0, ownMat: 0 };
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    if (sz[a] < 0.05 || sz[b] < 0.05 || sz[c] < 0.05) continue;
    faceNormal(mesh, t, fn);
    const ex = eye[0] - pos[a * 3], ey = eye[1] - pos[a * 3 + 1], ez = eye[2] - pos[a * 3 + 2];
    if (fn[0] * ex + fn[1] * ey + fn[2] * ez <= 0) continue; // back face
    const area = (sx[b] - sx[a]) * (sy[c] - sy[a]) - (sy[b] - sy[a]) * (sx[c] - sx[a]);
    if (Math.abs(area) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[c])));
    const i1 = Math.min(W - 1, Math.ceil(Math.max(sx[a], sx[b], sx[c])));
    const j0 = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[c])));
    const j1 = Math.min(H - 1, Math.ceil(Math.max(sy[a], sy[b], sy[c])));
    const flatA = flatShading || vertexIsFlat(mesh, a);
    for (let j = j0; j <= j1; j++) {
      const py = j + 0.5;
      for (let i = i0; i <= i1; i++) {
        const px = i + 0.5;
        let l0 = ((sx[b] - px) * (sy[c] - py) - (sy[b] - py) * (sx[c] - px)) / area;
        let l1 = ((sx[c] - px) * (sy[a] - py) - (sy[c] - py) * (sx[a] - px)) / area;
        let l2 = 1 - l0 - l1;
        if (l0 < 0 || l1 < 0 || l2 < 0) continue;
        const iz = l0 / sz[a] + l1 / sz[b] + l2 / sz[c];
        const depth = 1 / iz;
        const k = j * W + i;
        if (depth >= zbuf[k]) continue;
        zbuf[k] = depth;
        // perspective-correct weights
        const w0 = (l0 / sz[a]) * depth, w1 = (l1 / sz[b]) * depth, w2 = 1 - w0 - w1;
        let nx, ny, nz;
        if (flatA) { nx = fn[0]; ny = fn[1]; nz = fn[2]; } else {
          nx = w0 * nrm[a * 3] + w1 * nrm[b * 3] + w2 * nrm[c * 3];
          ny = w0 * nrm[a * 3 + 1] + w1 * nrm[b * 3 + 1] + w2 * nrm[c * 3 + 1];
          nz = w0 * nrm[a * 3 + 2] + w1 * nrm[b * 3 + 2] + w2 * nrm[c * 3 + 2];
          const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        }
        let m;
        if (fragment) {
          for (let d = 0; d < dim; d++) tmp[d] = w0 * att[a * dim + d] + w1 * att[b * dim + d] + w2 * att[c * dim + d];
          info.t = t; info.a = a; info.b = b; info.c = c; info.quad = mesh.triQuad[t];
          info.w[0] = w0; info.w[1] = w1; info.w[2] = w2;
          info.x = w0 * pos[a * 3] + w1 * pos[b * 3] + w2 * pos[c * 3];
          info.y = w0 * pos[a * 3 + 1] + w1 * pos[b * 3 + 1] + w2 * pos[c * 3 + 1];
          info.z = w0 * pos[a * 3 + 2] + w1 * pos[b * 3 + 2] + w2 * pos[c * 3 + 2];
          info.ownMat = mesh.mat[a];
          m = fragment(tmp, info, scene);
        } else m = mesh.mat[a];
        const aov = w0 * ao[a] + w1 * ao[b] + w2 * ao[c];
        const sun = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
        const light = (0.9 * sun + 0.35 + 0.25 * (ny * 0.5 + 0.5)) * aov;
        const col = PALETTE[m] ?? [255, 0, 255];
        acc[k * 3] = Math.min(255, col[0] * light);
        acc[k * 3 + 1] = Math.min(255, col[1] * light);
        acc[k * 3 + 2] = Math.min(255, col[2] * light);
      }
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      let r0 = 0, g0 = 0, b0 = 0;
      for (let dj = 0; dj < ss; dj++) for (let di = 0; di < ss; di++) {
        const k = (j * ss + dj) * W + (i * ss + di);
        r0 += acc[k * 3]; g0 += acc[k * 3 + 1]; b0 += acc[k * 3 + 2];
      }
      const n = ss * ss;
      rgb[(j * width + i) * 3] = r0 / n;
      rgb[(j * width + i) * 3 + 1] = g0 / n;
      rgb[(j * width + i) * 3 + 2] = b0 / n;
    }
  }
  return { width, height, rgb };
}
