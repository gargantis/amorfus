// Partition test: a scene shifted so its shape crosses the x = 32 chunk
// face, meshed as chunk 0 and chunk 1 from their own regions; every vertex
// on the shared corner plane must match in position and normal.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [cfgPath, ...labels] = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(cfgPath)).href);
const SHIFTS = { 'ramp-1:8': 16, 'ramp-1:4': 20, 'ramp-diag-1:2.8': 16, 'mound-r6.4': 16, 'pit-r5.4': 16, 'tower-r4.6': 16, 'terrace-disc': 16, 'tunnel-1x2': 0, 'roof-2-high': 16 };
for (const lab of labels) {
  const c = mod.configs.find((x) => x.label === lab);
  let bad = 0, shared = 0;
  for (const [name, sh] of Object.entries(SHIFTS)) {
    const scene = ALL_SCENES.find((s) => s.name === name);
    const cell0 = (x, y, z) => scene.cell(x - sh, y, z);
    const cell1 = (x, y, z) => scene.cell(x + 32 - sh, y, z);
    const m0 = c.mesh(core.buildRegion(cell0, c.apron ?? 10), core);
    const m1 = c.mesh(core.buildRegion(cell1, c.apron ?? 10), core);
    const key = (m, v, dx) => `${m.corner[v * 3] + dx},${m.corner[v * 3 + 1]},${m.corner[v * 3 + 2]},${m.mat[v]},${m.flags[v] & 1}`;
    const map0 = new Map();
    for (let v = 0; v < m0.V; v++) if (m0.corner[v * 3] === 32 && (m0.flags[v] & 1) === 0) map0.set(key(m0, v, 0), v);
    for (let v = 0; v < m1.V; v++) {
      if (m1.corner[v * 3] !== 0 || (m1.flags[v] & 1) !== 0) continue;
      const u = map0.get(key(m1, v, 32));
      if (u === undefined) continue;
      shared++;
      const dp = [0, 1, 2].map((a) => Math.abs(m0.pos[u * 3 + a] - (m1.pos[v * 3 + a] + (a === 0 ? 32 : 0))));
      const dn = [0, 1, 2].map((a) => Math.abs(m0.nrm[u * 3 + a] - m1.nrm[v * 3 + a]));
      if (Math.max(...dp) > 1e-9 || Math.max(...dn) > 1e-9 || m0.ao[u] !== m1.ao[v]) { bad++; if (bad < 4) console.log(lab, name, 'mismatch at', key(m1, v, 32), dp, dn); }
    }
  }
  console.log(`${lab}: shared ${shared}, mismatches ${bad}`);
}
