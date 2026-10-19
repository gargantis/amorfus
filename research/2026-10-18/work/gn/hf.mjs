// High-frequency shading-normal error: per in-window vertex, err = n − n_ideal
// (vectors); hf = |err_v − mean of neighbours' err| in degrees (small-angle).
// Lumps and terraces score high; a smooth bias (a slowly varying error) scores ~0.
// Also: lumpiness of AO is the harness's AO roughness, so not repeated here.
import * as core from '../../harness/core.mjs';
import { GEOMETRY_SCENES } from '../../harness/scenes.mjs';
const qkey = (pos, v) => `${Math.round(pos[v * 3] * 256)},${Math.round(pos[v * 3 + 1] * 256)},${Math.round(pos[v * 3 + 2] * 256)}`;
export function hfNormalError(m, scene, flat = false) {
  const g = scene.ideal;
  const err = new Map(), nb = new Map();
  const fn = [0, 0, 0, 0];
  for (let t = 0; t < m.T; t++) {
    const vs = [m.tri[t * 3], m.tri[t * 3 + 1], m.tri[t * 3 + 2]];
    const c = [0, 1, 2].map((a) => vs.reduce((acc, v) => acc + m.pos[v * 3 + a], 0) / 3);
    if (!g.inWindow(c)) continue;
    core.faceNormal(m, t, fn);
    for (let e = 0; e < 3; e++) {
      const v = vs[e];
      const k = qkey(m.pos, v);
      if (!err.has(k)) {
        const p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
        const ni = g.normal(p);
        const isFlat = flat || core.vertexIsFlat(m, v);
        const n = isFlat ? [fn[0], fn[1], fn[2]] : [m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]];
        err.set(k, [n[0] - ni[0], n[1] - ni[1], n[2] - ni[2]]);
      }
      const k2 = qkey(m.pos, vs[(e + 1) % 3]);
      if (!nb.has(k)) nb.set(k, new Set());
      if (!nb.has(k2)) nb.set(k2, new Set());
      nb.get(k).add(k2); nb.get(k2).add(k);
    }
  }
  let s2 = 0, n = 0;
  for (const [k, set] of nb) {
    const e0 = err.get(k); if (!e0) continue;
    const mean = [0, 0, 0]; let c = 0;
    for (const o of set) { const e = err.get(o); if (!e) continue; mean[0] += e[0]; mean[1] += e[1]; mean[2] += e[2]; c++; }
    if (!c) continue;
    const d = [e0[0] - mean[0] / c, e0[1] - mean[1] / c, e0[2] - mean[2] / c];
    s2 += d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; n++;
  }
  return (Math.sqrt(s2 / n) * 180) / Math.PI;
}
