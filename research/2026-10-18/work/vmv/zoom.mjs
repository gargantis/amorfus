// vmv: zoomed plan views (block grid + up-facing triangle edges) of an
// adversarial (work/vmf/adv-scenes.mjs) or harness scene, side by side for
// several approaches (left → right in the order given).
//   node work/vmv/zoom.mjs <scene> x0 z0 x1 z1 S out.png approaches/a.mjs …
import { join } from 'node:path';
import { ADV_SCENES } from '../vmf/adv-scenes.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { core, loadApproach, plan, zoomRgb, hcat, save, ROOT } from './vlib.mjs';
const [sceneName, x0, z0, x1, z1, S, out, ...files] = process.argv.slice(2);
const sc = ADV_SCENES.find((s) => s.name === sceneName) ?? ALL_SCENES.find((s) => s.name === sceneName);
if (!sc) throw new Error(`no scene ${sceneName}`);
const win = [+x0, +z0, +x1, +z1];
const imgs = [];
for (const f of files) {
  const A = await loadApproach(f);
  const { m, img } = plan(A, sc.cell, win, +S);
  imgs.push(zoomRgb(img, m));
}
const path = out.startsWith('/') ? out : join(ROOT, 'out', 'vmv-adv', out);
save(path, hcat(imgs, 8));
console.log(path);
