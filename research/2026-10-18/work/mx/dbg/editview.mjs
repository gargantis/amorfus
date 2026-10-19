// Close-up of an edit scenario chunk with an approach; modes as in view.mjs.
import * as core from '../../../harness/core.mjs';
import { renderShaded } from '../../../harness/raster.mjs';
import { writePng } from '../../../harness/png.mjs';
import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { buildScenarios, SEED } from '../../gh/editscenes.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [modPath, scen, out, mode = 'mat', Ws = '600', Hs = '420', eyeS, tgtS] = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(modPath)).href);
const sc = buildScenarios()[scen];
const c = sc.chunks[0];
const region = buildGenMeshInput(SEED, c[0], c[1], c[2], sc.edits, { forceApron: mod.apron ?? 10 }).input;
const mesh = mod.mesh(region, null, core);
const dom = (a) => { const ax = Math.abs(a[0]), ay = Math.abs(a[1]), az = Math.abs(a[2]); return ay >= 0.5 * Math.max(ax, az) ? 1 : ax >= az ? 0 : 2; };
const frag = (a, i) => {
  if (mode === 'own') return i.ownMat;
  const m = mod.fragment ? mod.fragment(a, i, null) : i.ownMat;
  if (mode === 'axis') { const ax = dom(a); return ax === 1 ? m : ax === 0 ? 4 : 7; }
  return m;
};
const img = renderShaded(mesh, { width: Number(Ws), height: Number(Hs), eye: eyeS.split(',').map(Number), target: tgtS.split(',').map(Number), fragment: frag });
writePng(out, img.width, img.height, img.rgb);
console.log('wrote', out);
