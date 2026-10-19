// Histogram of xBR saddle weights (wd1-wd2, sorted so the first is the larger)
// over the surface-followed windows of coded blocks on the 16 bench chunks.
import * as core from '../../../harness/core.mjs';
import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { prep, makeWindow, fillWindow, U, DIRS, UVA } from '../prod.mjs';
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const hist = new Map();
const df = (p, q) => (p === q ? 0 : 1);
for (const c of CHUNKS) {
  const reg = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const P = prep(reg);
  const W = makeWindow(2);
  for (let d = 0; d < 6; d++) {
    const [a, s] = DIRS[d];
    const pl = { d, a, s, bit: 1 << d, SA: P.stride[a], SU: P.stride[UVA[a][0]], SV: P.stride[UVA[a][1]] };
    for (let L = 0; L < 32; L++) for (let v = 0; v < 32; v++) for (let u = 0; u < 32; u++) {
      const i = P.off + u * pl.SU + v * pl.SV + L * pl.SA;
      if (P.cm[i] === 0 || !(P.expo[i] & pl.bit)) continue;
      fillWindow(P, pl, W, u, v, L, 4);
      // saddle at the cell's (+u,+v) corner: lattice point (3,3) of the 5×5 window
      const S = 5, at = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? U : W.img[y * S + x]);
      const x = 3, y = 3;
      const A = at(x - 1, y - 1), B = at(x, y - 1), C = at(x - 1, y), D = at(x, y);
      if (!(A === D && B === C && A !== B && A !== U && B !== U)) continue;
      const wd1 = df(A, at(x, y - 2)) + df(A, at(x - 2, y)) + df(D, at(x - 1, y + 1)) + df(D, at(x + 1, y - 1));
      const wd2 = df(C, at(x - 2, y - 1)) + df(C, at(x, y + 1)) + df(B, at(x + 1, y)) + df(B, at(x - 1, y - 2));
      const k = `${Math.max(wd1, wd2)}-${Math.min(wd1, wd2)}`;
      hist.set(k, (hist.get(k) ?? 0) + 1);
    }
  }
}
console.log([...hist.entries()].sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k}:${v}`).join('  '));
