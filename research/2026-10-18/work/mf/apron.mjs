// Seam check: the per-vertex field must not depend on the region size.
// Compare attrs (by vertex corner+material) at aprons 4..7 against apron 10,
// and time the field pass alone (base mesh excluded), warm.
import * as core from '../../harness/core.mjs';
import { makeFast } from './fast.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const P = JSON.parse(process.argv[2] ?? '{"sigma":1.2,"trunc":2.5,"tau":0.55,"bits":5}');
const fast = makeFast(P);
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const keyed = (m) => {
  const map = new Map();
  for (let v = 0; v < m.V; v++) {
    if (m.corner[v * 3] < -1000) continue; // fan centres: compare by triangle below
    map.set(`${m.corner[v * 3]},${m.corner[v * 3 + 1]},${m.corner[v * 3 + 2]},${m.mat[v]},${m.flags[v] & 1}`, Array.from(m.attrs.subarray(v * 8, v * 8 + 8)).join(','));
  }
  return map;
};
const ref = new Map();
for (const c of CH) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const m = fast(core.decodeMesh(core.meshRegion({ ...inp, params: {} })), inp);
  ref.set(c.join(), { k: keyed(m), tri: Array.from(m.tri).join(','), T: m.T });
}
for (const apron of (process.argv[3] ? JSON.parse(process.argv[3]) : [4, 5, 6, 7])) {
  let bad = 0, triBad = 0, total = 0, msField = 0, msBase = 0;
  for (const c of CH) {
    const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: apron }).input;
    const t0 = performance.now();
    const base = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
    const t1 = performance.now();
    const m = fast(base, inp);
    const t2 = performance.now();
    msBase += t1 - t0; msField += t2 - t1;
    const k = keyed(m), r = ref.get(c.join());
    for (const [key, val] of r.k) { total++; if (k.get(key) !== val) bad++; }
    if (Array.from(m.tri).join(',') !== r.tri) triBad++;
  }
  console.log(`apron ${apron}: ${bad}/${total} vertex fields differ from apron 10; ${triBad}/16 chunks with different triangles; base mesh ${(msBase / 16).toFixed(1)} ms, field pass ${(msField / 16).toFixed(1)} ms per chunk`);
}
