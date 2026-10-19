// Side-by-side renders (left | right) for the report, into out/gn-best/img/.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { meshRegion } from './mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { CHECKS } from './aocheck-scenes.mjs';
import { PARAMS as BEST } from '../../approaches/gn-best.mjs';
import { PARAMS as BEV } from '../../approaches/gn-bevel.mjs';
const OUT = 'out/gn-best/img';
const side = (a, b, file) => {
  const W = a.width + 4 + b.width, H = Math.max(a.height, b.height);
  const rgb = new Uint8Array(W * H * 3).fill(255);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < a.width; x++) for (let c = 0; c < 3; c++) rgb[(y * W + x) * 3 + c] = a.rgb[(y * a.width + x) * 3 + c];
    for (let x = 0; x < b.width; x++) for (let c = 0; c < 3; c++) rgb[(y * W + a.width + 4 + x) * 3 + c] = b.rgb[(y * b.width + x) * 3 + c];
  }
  writePng(`${OUT}/${file}`, W, H, rgb);
};
const repoParams = (p) => p;
const mk = (region, params, repo = false) => core.decodeMesh(repo ? repoMesh({ ...region, params }) : meshRegion({ ...region, params }));
const flatIf = (m, params) => params && params.rule === 'bevel' && params.faceted !== false;
// scenes
for (const [sn, file] of [['mound-r6.4', 'cmp-mound.png'], ['ramp-1:2', 'cmp-ramp-1-2.png'], ['ramp-1:4', 'cmp-ramp-1-4.png'], ['hill-materials', 'cmp-hill.png'], ['tower-r4.6', 'cmp-tower.png'], ['ramp-diag-1:2.8', 'cmp-ramp-diag.png']]) {
  const s = ALL_SCENES.find((x) => x.name === sn);
  const region = core.buildRegion(s.cell, 10);
  const a = renderShaded(mk(region, {}, true), { ...s.camera });
  const b = renderShaded(mk(region, BEST), { ...s.camera });
  side(a, b, file);
}
// real terrain
const VIEWS = {
  'terrain-mountain': { chunk: [-1, 1, 1], eye: [44, 40, 44], target: [14, 14, 14] },
  'terrain-beach': { chunk: [0, 0, -3], eye: [40, 34, 42], target: [15, 18, 15] },
};
for (const [label, v] of Object.entries(VIEWS)) {
  const inp = buildGenMeshInput([1, 1], ...v.chunk, new Map(), { forceApron: 3 }).input;
  const cam = { width: 560, height: 380, eye: v.eye, target: v.target };
  side(renderShaded(mk(inp, {}, true), cam), renderShaded(mk(inp, BEST), cam), `cmp-${label}.png`);
  // bevel: repo bevel (faceted) | gn-bevel
  side(renderShaded(mk(inp, { rule: 'bevel' }, true), { ...cam, flatShading: false }), renderShaded(mk(inp, BEV), cam), `cmp-bevel-${label}.png`);
}
// AO purpose: production | gn-best on the concave checks
for (const c of CHECKS.filter((x) => ['inside-corner', 'overhang', 'wall-foot'].includes(x.name))) {
  const region = core.buildRegion(c.cell, 10);
  side(renderShaded(mk(region, {}, true), { ...c.camera }), renderShaded(mk(region, BEST), { ...c.camera }), `cmp-ao-${c.name}.png`);
}
console.log('composites written');
