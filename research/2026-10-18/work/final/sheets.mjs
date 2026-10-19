// Final comparison sheets for the owner: identical cameras per row,
// columns = rules. Today = production hints (production AO, block materials).
import * as core from '../../harness/core.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { hcat, vcat, save } from '../vmf/lib.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { buildGenMeshInputGM } from '../gm/input.mjs';
import { GEOMETRY_SCENES, MATERIAL_SCENES } from '../../harness/scenes.mjs';
import * as hints from '../../approaches/hints.mjs';
import * as bevel from '../../approaches/bevel.mjs';
import * as stack from '../../approaches/stack-base-l.mjs';
import * as mvq from '../../approaches/mv-quad.mjs';
import * as mxc from '../../approaches/mx-codes.mjs';
import { ghScenarios, ghInputs } from '../stack/edits.mjs';
const OUT = new URL('./img/', import.meta.url).pathname;
const GAP = (h) => ({ width: 6, height: h, rgb: new Uint8Array(6 * h * 3).fill(255) });
const row = (imgs) => hcat(imgs.flatMap((im, i) => (i ? [GAP(im.height), im] : [im])));
const render = (A, mesh, cam, w = 520, h = 360) =>
  renderShaded(mesh, { ...cam, width: w, height: h, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null, flatShading: A.flatShading === true });

// A. real generated terrain (bench chunks), production input; the stack gets planes
const TERRAIN = {
  mountain: { chunk: [-1, 1, 1], eye: [44, 40, 44], target: [14, 14, 14] },
  mountainClose: { chunk: [-1, 1, 1], eye: [30, 31, 30], target: [14, 18, 14] },
  beach: { chunk: [0, 0, -3], eye: [40, 34, 42], target: [15, 18, 15] },
  beachClose: { chunk: [0, 0, -3], eye: [28, 27, 30], target: [14, 20, 14] },
};
const rowsA = [];
for (const [label, v] of Object.entries(TERRAIN)) {
  const prod = buildGenMeshInput([1, 1], ...v.chunk, new Map(), { forceApron: 10 }).input;
  const gm = buildGenMeshInputGM([1, 1], ...v.chunk, new Map(), { forceApron: 10 }).input;
  const ims = [render(hints, hints.mesh(prod, null, core), v), render(bevel, bevel.mesh(prod, null, core), v), render(stack, stack.mesh(gm, null, core), v)];
  save(`${OUT}terrain-${label}.png`, row(ims));
  rowsA.push(row(ims));
  console.log('terrain', label);
}

// B. edited real terrain (gh scenarios), first chunk, today vs stack
const VIEWS = {
  mountain: { overview: { eye: [46, 44, 16], target: [14, 18, 16] }, road: { eye: [36, 30, -6], target: [20, 16, 6] }, mound: { eye: [34, 34, 4], target: [22, 20, 14] }, 'pit-terrace': { eye: [8, 46, 40], target: [14, 24, 23] } },
  town: { overview: { eye: [16, 34, 44], target: [16, 16, 14] }, houses: { eye: [36, 26, 36], target: [18, 18, 16] } },
};
const sc = ghScenarios();
for (const [name, views] of Object.entries(VIEWS)) {
  const c = sc[name].chunks[0];
  const prod = buildGenMeshInput([1, 1], c[0], c[1], c[2], sc[name].edits, { forceApron: 10 }).input;
  const gm = ghInputs(name, 10)[0];
  const mh = hints.mesh(prod, null, core), ms = stack.mesh(gm, null, core), mb = bevel.mesh(prod, null, core);
  for (const [vl, cam] of Object.entries(views)) {
    save(`${OUT}edit-${name}-${vl}.png`, row([render(hints, mh, cam), render(bevel, mb, cam), render(stack, ms, cam)]));
    console.log('edit', name, vl);
  }
}

// C. built shapes (harness scenes): today | bevel | stack
for (const n of ['ramp-1:4', 'ramp-1:8', 'mound-r6.4', 'pit-r5.4', 'terrace-disc', 'tower-r4.6']) {
  const s = GEOMETRY_SCENES.find((x) => x.name === n);
  const region = core.buildRegion(s.cell, 10);
  save(`${OUT}built-${n.replace(':', '-')}.png`, row([hints, bevel, stack].map((A) => render(A, A.mesh(region, s, core), s.camera, 420, 290))));
  console.log('built', n);
}

// E. the 1-wide diagonal line and the 1:2 line in perspective: today | bevel | mv-quad | mx-codes
for (const n of ['line1-1:1', 'line1-1:2', 'disc-r4.3', 'junction3']) {
  const s = MATERIAL_SCENES.find((x) => x.name === n);
  const region = core.buildRegion(s.cell, 10);
  save(`${OUT}paint-${n.replace(':', '-')}-view.png`, row([hints, bevel, mvq, mxc].map((A) => render(A, A.mesh(region, null, core), s.camera, 420, 290))));
  console.log('paint', n);
}
