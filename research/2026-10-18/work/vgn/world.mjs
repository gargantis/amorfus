// vgn: mesh a box of chunks (production apron rule unless forced) and merge
// into one plain mesh in world coordinates; render side-by-side composites.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
export const MESHERS = {
  prod: (inp) => core.decodeMesh(repoMesh({ ...inp, params: {} })),
  gn: (inp) => core.decodeMesh(gnMesh({ ...inp, params: PARAMS })),
};
export function merge(meshes) {
  let V = 0, T = 0, Q = 0;
  for (const { m } of meshes) { V += m.V; T += m.T; Q += m.quadCount; }
  const pos = new Float64Array(V * 3), nrm = new Float64Array(V * 3), ao = new Float64Array(V);
  const mat = new Uint8Array(V), flags = new Uint8Array(V), tri = new Uint32Array(T * 3), triQuad = new Int32Array(T);
  let vo = 0, to = 0, qo = 0;
  for (const { m, off } of meshes) {
    for (let v = 0; v < m.V; v++) {
      for (let a = 0; a < 3; a++) { pos[(vo + v) * 3 + a] = m.pos[v * 3 + a] + off[a]; nrm[(vo + v) * 3 + a] = m.nrm[v * 3 + a]; }
      ao[vo + v] = m.ao[v]; mat[vo + v] = m.mat[v]; flags[vo + v] = m.flags[v];
    }
    for (let t = 0; t < m.T; t++) { for (let k = 0; k < 3; k++) tri[(to + t) * 3 + k] = m.tri[t * 3 + k] + vo; triQuad[to + t] = m.triQuad[t] + qo; }
    vo += m.V; to += m.T; qo += m.quadCount;
  }
  return { V, pos, nrm, ao, mat, flags, T, tri, triQuad, quadCount: Q };
}
/** mesh chunks [c0..c1] inclusive of seed with edits; returns {prod, gn, aprons} merged meshes */
export function meshWorld(seed, c0, c1, edits = new Map(), which = ['prod', 'gn'], opts = {}) {
  const out = {};
  const aprons = [];
  const lists = Object.fromEntries(which.map((w) => [w, []]));
  for (let cy = c0[1]; cy <= c1[1]; cy++) for (let cz = c0[2]; cz <= c1[2]; cz++) for (let cx = c0[0]; cx <= c1[0]; cx++) {
    const { input, apron } = buildGenMeshInput(seed, cx, cy, cz, edits, opts);
    aprons.push([cx, cy, cz, apron]);
    for (const w of which) lists[w].push({ m: (opts.meshers ?? MESHERS)[w](input), off: [cx * 32, cy * 32, cz * 32] });
  }
  for (const w of which) out[w] = merge(lists[w]);
  out.aprons = aprons;
  return out;
}
/** render several meshes with one camera, side by side (4 px white gap) */
export function renderRow(path, meshes, cam) {
  const imgs = meshes.map((m) => renderShaded(m, { width: cam.width ?? 520, height: cam.height ?? 360, eye: cam.eye, target: cam.target, fovDeg: cam.fov ?? 60 }));
  const gap = 4, W = imgs.reduce((s, i) => s + i.width, 0) + gap * (imgs.length - 1), H = imgs[0].height;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  let x0 = 0;
  for (const im of imgs) {
    for (let j = 0; j < H; j++) for (let i = 0; i < im.width; i++) for (let k = 0; k < 3; k++) rgb[(j * W + x0 + i) * 3 + k] = im.rgb[(j * im.width + i) * 3 + k];
    x0 += im.width + gap;
  }
  writePng(path, W, H, rgb);
  return path;
}
