// Compare per-vertex slot bytes of two approach modules on bench chunks + scenes.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const A = await import(pathToFileURL(resolve(process.argv[2])).href);
const B = await import(pathToFileURL(resolve(process.argv[3])).href);
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let tot = 0, diff = 0;
const cmp = (label, inp) => {
  const ma = A.mesh(inp, null, core), mb = B.mesh(inp, null, core);
  let d = 0;
  for (let i = 0; i < ma.slotBytes.length; i++) if (ma.slotBytes[i] !== mb.slotBytes[i]) d++;
  tot += ma.slotBytes.length; diff += d;
  if (d) console.log(label, 'bytes differ:', d, 'of', ma.slotBytes.length);
};
for (const c of CHUNKS) cmp(c.join(','), buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input);
for (const s of MATERIAL_SCENES) cmp(s.name, core.buildRegion(s.cell, 10));
console.log(`total ${tot} bytes, ${diff} differ`);
