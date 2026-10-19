// vmf: interleaved min-of-N timing of (a) generation (GEN_MESH input) at
// aprons 3/6/10, (b) the hints mesher at 3/6/10, (c) the mf-iso field pass
// ALONE (on a pre-decoded mesh copy) at 6 and 10, on the 16 bench chunks.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { makeFast } from '../mf/fast.mjs';
const add = makeFast({ sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 });
const N = Number(process.argv[2] ?? 9);
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const best = {};
const rec = (k, ci, t) => { (best[k] ??= CH.map(() => Infinity)); if (t < best[k][ci]) best[k][ci] = t; };
const inp = CH.map((c) => ({ 3: null, 6: null, 10: null }));
const clone = (m) => ({ ...m, pos: m.pos.slice(), nrm: m.nrm.slice(), mat: m.mat.slice(), flags: m.flags.slice(), ao: m.ao.slice(), tri: m.tri.slice(), triQuad: m.triQuad.slice(), corner: m.corner.slice() });
for (let r = 0; r < N; r++) {
  for (let ci = 0; ci < CH.length; ci++) {
    const c = CH[ci];
    for (const a of [3, 6, 10]) {
      let t0 = performance.now();
      const input = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: a }).input;
      rec(`gen a${a}`, ci, performance.now() - t0);
      t0 = performance.now();
      const raw = core.meshRegion({ ...input, params: {} });
      rec(`hints mesh a${a}`, ci, performance.now() - t0);
      if (a === 3) continue;
      const dec = core.decodeMesh(raw);
      const m = clone(dec);
      t0 = performance.now();
      add(m, input);
      rec(`mf field a${a}`, ci, performance.now() - t0);
    }
  }
}
for (const [k, v] of Object.entries(best)) {
  const s = v.slice().sort((a, b) => a - b);
  console.log(`${k.padEnd(16)} min of ${N}: mean ${(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2)} ms, median ${s[s.length >> 1].toFixed(2)}, max ${s[s.length - 1].toFixed(2)}`);
}
