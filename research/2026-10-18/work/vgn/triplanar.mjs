// vgn: the production shader's triplanar texturing (weights pow(|n|,4) of the
// interpolated SHADING normal, planes under 3 % skipped; uv = zy / xz / xy as
// in terrain.wgsl) with a procedural texture (4×4 checker per block + dark
// block-edge lines), Lambert sun + hemi × AO. The harness renderer uses flat
// colours and cannot show which projection a face samples.
//   node work/vgn/triplanar.mjs
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { THIN, BASE } from './thin-scenes.mjs';
import { PALETTE } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
const SUN = [0.5, 0.8, 0.3].map((x) => x / Math.hypot(0.5, 0.8, 0.3));
const tex = (u, v) => {
  const fu = u - Math.floor(u), fv = v - Math.floor(v);
  const chk = ((Math.floor(fu * 4) + Math.floor(fv * 4)) & 1) ? 0.82 : 1.0;
  const edge = fu < 0.06 || fv < 0.06 ? 0.55 : 1;
  return chk * edge;
};
export function renderTri(mesh, { width = 480, height = 340, ss = 3, eye, target, fovDeg = 55, bg = [168, 196, 226] }) {
  const W = width * ss, H = height * ss;
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const norm = (p) => { const l = Math.hypot(...p) || 1; return p.map((x) => x / l); };
  const f = norm(sub(target, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const tanH = Math.tan((fovDeg * Math.PI) / 360), aspect = W / H;
  const { pos, nrm, tri, T, ao, V } = mesh;
  const sx = new Float64Array(V), sy = new Float64Array(V), sz = new Float64Array(V);
  for (let v = 0; v < V; v++) {
    const d = [pos[v * 3] - eye[0], pos[v * 3 + 1] - eye[1], pos[v * 3 + 2] - eye[2]];
    const cx = d[0] * r[0] + d[1] * r[1] + d[2] * r[2], cy = d[0] * u[0] + d[1] * u[1] + d[2] * u[2], cz = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    sz[v] = cz; sx[v] = (cx / (cz * tanH * aspect) * 0.5 + 0.5) * W; sy[v] = (-cy / (cz * tanH) * 0.5 + 0.5) * H;
  }
  const zb = new Float64Array(W * H).fill(Infinity), acc = new Float64Array(W * H * 3);
  for (let k = 0; k < W * H; k++) { acc[k * 3] = bg[0]; acc[k * 3 + 1] = bg[1]; acc[k * 3 + 2] = bg[2]; }
  const fn = [0, 0, 0, 0];
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    if (sz[a] < 0.05 || sz[b] < 0.05 || sz[c] < 0.05) continue;
    core.faceNormal(mesh, t, fn);
    if (fn[0] * (eye[0] - pos[a * 3]) + fn[1] * (eye[1] - pos[a * 3 + 1]) + fn[2] * (eye[2] - pos[a * 3 + 2]) <= 0) continue;
    const area = (sx[b] - sx[a]) * (sy[c] - sy[a]) - (sy[b] - sy[a]) * (sx[c] - sx[a]);
    if (Math.abs(area) < 1e-12) continue;
    const flat = core.vertexIsFlat(mesh, a);
    const i0 = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[c]))), i1 = Math.min(W - 1, Math.ceil(Math.max(sx[a], sx[b], sx[c])));
    const j0 = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[c]))), j1 = Math.min(H - 1, Math.ceil(Math.max(sy[a], sy[b], sy[c])));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i + 0.5, py = j + 0.5;
      const l0 = ((sx[b] - px) * (sy[c] - py) - (sy[b] - py) * (sx[c] - px)) / area;
      const l1 = ((sx[c] - px) * (sy[a] - py) - (sy[c] - py) * (sx[a] - px)) / area;
      const l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const depth = 1 / (l0 / sz[a] + l1 / sz[b] + l2 / sz[c]);
      const k = j * W + i;
      if (depth >= zb[k]) continue;
      zb[k] = depth;
      const w0 = (l0 / sz[a]) * depth, w1 = (l1 / sz[b]) * depth, w2 = 1 - w0 - w1;
      let n = flat ? [fn[0], fn[1], fn[2]] : norm([0, 1, 2].map((q) => w0 * nrm[a * 3 + q] + w1 * nrm[b * 3 + q] + w2 * nrm[c * 3 + q]));
      const P = [0, 1, 2].map((q) => w0 * pos[a * 3 + q] + w1 * pos[b * 3 + q] + w2 * pos[c * 3 + q]);
      const w4 = n.map((x) => Math.abs(x) ** 4), s4 = w4[0] + w4[1] + w4[2];
      const w = w4.map((x) => x / s4);
      let albedo = 0;
      if (w[0] > 0.03) albedo += w[0] * tex(P[2], P[1]);
      if (w[1] > 0.03) albedo += w[1] * tex(P[0], P[2]);
      if (w[2] > 0.03) albedo += w[2] * tex(P[0], P[1]);
      const aov = w0 * ao[a] + w1 * ao[b] + w2 * ao[c];
      const light = (0.9 * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) + 0.35 + 0.25 * (n[1] * 0.5 + 0.5)) * aov;
      const col = PALETTE[mesh.mat[a]];
      for (let q = 0; q < 3; q++) acc[k * 3 + q] = Math.min(255, col[q] * albedo * light);
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) for (let q = 0; q < 3; q++) {
    let s = 0; for (let dj = 0; dj < ss; dj++) for (let di = 0; di < ss; di++) s += acc[((j * ss + dj) * W + i * ss + di) * 3 + q];
    rgb[(j * width + i) * 3 + q] = s / (ss * ss);
  }
  return { width, height, rgb };
}
const shots = [
  ['posts-gap2', { eye: [19.5, BASE + 3.2, 21.5], target: [16, BASE + 1.5, 16] }],
  ['fence-1w-3h', { eye: [21, BASE + 3.5, 21], target: [16.5, BASE + 1.5, 14] }],
  ['tree', { eye: [21, BASE + 4, 21], target: [16.5, BASE + 3, 16.5] }],
  ['wall-diag-1w', { eye: [22, BASE + 4, 12], target: [16, BASE + 1.5, 16] }],
];
for (const [n, cam] of shots) {
  const s = THIN.find((x) => x.name === n);
  const region = core.buildRegion(s.cell, 10);
  const P = core.decodeMesh(repoMesh({ ...region, params: {} }));
  const G = core.decodeMesh(gnMesh({ ...region, params: PARAMS }));
  const a = renderTri(P, cam), b = renderTri(G, cam);
  const gap = 4, WW = a.width * 2 + gap;
  const rgb = new Uint8Array(WW * a.height * 3).fill(255);
  for (let j = 0; j < a.height; j++) for (let i = 0; i < a.width; i++) for (let q = 0; q < 3; q++) { rgb[(j * WW + i) * 3 + q] = a.rgb[(j * a.width + i) * 3 + q]; rgb[(j * WW + a.width + gap + i) * 3 + q] = b.rgb[(j * a.width + i) * 3 + q]; }
  writePng(`${OUT}${n}-triplanar.png`, WW, a.height, rgb);
  console.log(`${OUT}${n}-triplanar.png`);
}
