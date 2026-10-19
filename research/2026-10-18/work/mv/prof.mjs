// Profile the mv pipeline stages on bench terrain chunks.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const mod = await import(pathToFileURL(resolve(process.argv[2] ?? 'approaches/mv-fit.mjs')).href);
const CHUNKS = [
  [-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2],
  [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1],
];
const apron = mod.apron ?? 10;
const inputs = CHUNKS.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: apron }).input);
for (let r = 0; r < 2; r++) {
  let tb = 0, tt = 0;
  for (let i = 0; i < inputs.length; i++) {
    const t0 = performance.now();
    const m = core.decodeMesh(core.meshRegion({ ...inputs[i], params: {} }));
    const t1 = performance.now();
    const out = mod.annotate ? mod.annotate(m, inputs[i], mod.OPT) : mod.mesh(inputs[i], null, core);
    const t2 = performance.now();
    tb += t1 - t0; tt += t2 - t1;
    if (r === 1) console.log(CHUNKS[i].join(','), `base ${(t1 - t0).toFixed(1)} ms, annotate ${(t2 - t1).toFixed(1)} ms`, JSON.stringify(out.fitStats ?? {}));
  }
  console.log(`round ${r}: base mean ${(tb / inputs.length).toFixed(1)} ms, annotate mean ${(tt / inputs.length).toFixed(1)} ms`);
}
