// Dump per-vertex slots in a terrain box: node work/mv/tverts.mjs <module> cx,cy,cz x0 x1 z0 z1
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { decodeSlots } from './pipeline.mjs';
const [mp, cs, x0, x1, z0, z1] = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(mp)).href);
const m = mod.mesh(buildGenMeshInput([1, 1], ...cs.split(',').map(Number), new Map(), { forceApron: mod.apron ?? 10 }).input, null, core);
for (let v = 0; v < m.V; v++) {
  const cx = m.corner[v * 3], cy = m.corner[v * 3 + 1], cz = m.corner[v * 3 + 2];
  if (cx < +x0 || cx > +x1 || cz < +z0 || cz > +z1) continue;
  const d = decodeSlots(m.slotBytes[v * 3], m.slotBytes[v * 3 + 1], m.slotBytes[v * 3 + 2], 64);
  if (!d.valid) continue;
  console.log(`v${v} c=(${cx},${cy},${cz}) pos=(${m.pos[v * 3].toFixed(2)},${m.pos[v * 3 + 1].toFixed(2)},${m.pos[v * 3 + 2].toFixed(2)}) n=(${m.nrm[v*3].toFixed(2)},${m.nrm[v*3+1].toFixed(2)},${m.nrm[v*3+2].toFixed(2)}) mat ${m.mat[v]} s=(${d.s1.toFixed(2)},${d.s2.toFixed(2)}) o=(${d.o1},${d.o2}) op ${d.op}`);
}
