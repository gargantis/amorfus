// Estimate of a per-vertex "no lookup needed" bit: a triangle is safe when
// every fragment would show the quad's own material without touching a code
// (sampled on 28 barycentric points; production would test the covered
// columns exactly). A vertex is safe when all its triangles are safe; a
// fragment skips the texel/code lookup when its triangle's 3 vertices are
// safe (the interpolated bit is exactly 1). Weighted by triangle area.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { prep, computeCodes, buildTexels, fragmentGpu, DEFAULTS } from './prod.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let aAll = 0, aSkip = 0;
for (const c of CH) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const P = prep(inp);
  const { codes } = computeCodes(P, { ...DEFAULTS, loneRound: true });
  const G = buildTexels(P, codes, 3);
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const safeT = new Uint8Array(m.T), area = new Float64Array(m.T);
  const vSafe = new Uint8Array(m.V).fill(1);
  const st = { fetch: 0, code: 0, noSurface: 0, sharp: 0, oob: 0 };
  for (let t = 0; t < m.T; t++) {
    const a = m.tri[t * 3], b = m.tri[t * 3 + 1], cc = m.tri[t * 3 + 2];
    const fn = core.faceNormal(m, t); area[t] = fn[3];
    let safe = true;
    if (m.flags[a] & 1) safe = true; // sharp: own material anyway
    else for (let i = 0; i <= 6 && safe; i++) for (let j = 0; j <= 6 - i && safe; j++) {
      const w0 = i / 6, w1 = j / 6, w2 = 1 - w0 - w1;
      const p = [0, 0, 0], n = [0, 0, 0];
      for (let k = 0; k < 3; k++) { p[k] = w0 * m.pos[a * 3 + k] + w1 * m.pos[b * 3 + k] + w2 * m.pos[cc * 3 + k]; n[k] = w0 * m.nrm[a * 3 + k] + w1 * m.nrm[b * 3 + k] + w2 * m.nrm[cc * 3 + k]; }
      const c0 = st.code;
      const r = fragmentGpu(G, n, p[0], p[1], p[2], 2, st, 0.5);
      if (st.code !== c0 || (r >= 0 && r !== m.mat[a])) safe = false;
    }
    safeT[t] = safe ? 1 : 0;
    if (!safe) { vSafe[a] = 0; vSafe[b] = 0; vSafe[cc] = 0; }
  }
  for (let t = 0; t < m.T; t++) {
    const a = m.tri[t * 3], b = m.tri[t * 3 + 1], cc = m.tri[t * 3 + 2];
    aAll += area[t];
    if (vSafe[a] && vSafe[b] && vSafe[cc]) aSkip += area[t];
  }
}
console.log(`surface area whose fragments could skip the lookup via a per-vertex bit: ${(100 * aSkip / aAll).toFixed(1)}%`);
