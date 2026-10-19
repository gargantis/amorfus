// The rejected gradient normal on thin features: hints | gn-grad | gn-best (overhang, roof).
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { meshRegion } from './mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { CHECKS } from './aocheck-scenes.mjs';
import { PARAMS as BEST } from '../../approaches/gn-best.mjs';
import { PARAMS as GRAD } from '../../approaches/gn-grad.mjs';
const three = (imgs, file) => {
  const W = imgs.reduce((a, i) => a + i.width, 0) + 4 * (imgs.length - 1), H = imgs[0].height;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  let ox = 0;
  for (const im of imgs) {
    for (let y = 0; y < H; y++) for (let x = 0; x < im.width; x++) for (let c = 0; c < 3; c++) rgb[(y * W + ox + x) * 3 + c] = im.rgb[(y * im.width + x) * 3 + c];
    ox += im.width + 4;
  }
  writePng(file, W, H, rgb);
};
const c = CHECKS.find((x) => x.name === 'overhang');
const region = core.buildRegion(c.cell, 10);
const r = (prm, repo) => renderShaded(core.decodeMesh(repo ? repoMesh({ ...region, params: {} }) : meshRegion({ ...region, params: prm })), { ...c.camera, width: 360, height: 240 });
three([r(null, true), r(GRAD), r(BEST)], 'out/gn-grad/img/cmp-overhang-hints-grad-best.png');
console.log('ok');
