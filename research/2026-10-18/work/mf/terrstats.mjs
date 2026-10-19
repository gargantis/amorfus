// flips/fans/triangles on the 16 bench chunks for a config
import * as core from '../../harness/core.mjs';
import { build } from './field.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const cfg = JSON.parse(process.argv[2]);
const apron = Number(process.argv[3] ?? 10);
const A = build(cfg);
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let q = 0, T = 0, V = 0, bq = 0, fl = 0, fa = 0, wa = 0, ms = 0;
for (const c of CH) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: apron }).input;
  const t0 = performance.now();
  const m = A.mesh(inp, null, core);
  ms += performance.now() - t0;
  q += m.quadCount; T += m.T; V += m.V; bq += m.mfStats.boundaryQuads; fl += m.mfStats.flipped; fa += m.mfStats.fans; wa += m.mfStats.wanted;
}
console.log(`quads ${q} tris ${T} (+${(100 * (T - 2 * q) / (2 * q)).toFixed(2)}%) verts ${V}; boundary quads ${bq} (${(100 * bq / q).toFixed(1)}%), flips wanted ${wa}, done ${fl} (${(100 * fl / q).toFixed(2)}%), fans ${fa} (${(100 * fa / q).toFixed(2)}%); ${(ms / CH.length).toFixed(1)} ms/chunk`);
