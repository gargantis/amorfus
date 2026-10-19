// Side-by-side sheets: rows = views, columns = approaches (left → right in the
// order given). A 4-px coloured strip on top of each panel keys the column:
// grey = hints, orange = mf-iso, blue = mx-codes (others: green).
//  node work/mx/sheet.mjs <out.png> <approach,...> <view;view;...>
//  view = scene:<name>:plan[:S] | scene:<name>:view | terrain:<cx,cy,cz>:<eye>:<target>[:WxH]
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown, materialImageRgb, renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [out, appList, viewList] = process.argv.slice(2);
const apps = [];
for (const a of appList.split(',')) apps.push(await import(pathToFileURL(resolve(`approaches/${a}.mjs`)).href));
const KEY = { hints: [150, 150, 150], 'mf-iso': [240, 140, 40], 'mx-codes': [40, 110, 230] };
const views = viewList.split(';');
const panels = []; // rows of {w,h,rgb}
for (const v of views) {
  const parts = v.split(':');
  const row = [];
  for (const app of apps) {
    let img;
    if (parts[0] === 'scene') {
      const scene = ALL_SCENES.find((s) => s.name === parts[1].replaceAll('~', ':'));
      const region = core.buildRegion(scene.cell, app.apron ?? 10);
      const mesh = app.mesh(region, scene, core);
      const frag = app.fragment ? (a, i) => app.fragment(a, i, scene) : null;
      if (parts[2] === 'plan') {
        const S = Number(parts[3] ?? 16);
        const im = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S, fragment: frag, scene });
        const c = materialImageRgb(im, { crop: scene.window });
        img = { w: c.width, h: c.height, rgb: c.rgb };
      } else {
        const r = renderShaded(mesh, { ...scene.camera, fragment: frag, scene });
        img = { w: r.width, h: r.height, rgb: r.rgb };
      }
    } else if (parts[0] === 'edit') {
      const { buildScenarios, SEED } = await import('../gh/editscenes.mjs');
      const sc = buildScenarios()[parts[1]];
      const c = sc.chunks[Number(parts[5] ?? 0)];
      const eye = parts[2].split(',').map(Number), target = parts[3].split(',').map(Number);
      const [W, H] = (parts[4] ?? '560x380').split('x').map(Number);
      const region = buildGenMeshInput(SEED, c[0], c[1], c[2], sc.edits, { forceApron: app.apron ?? 10 }).input;
      const mesh = app.mesh(region, null, core);
      const frag = app.fragment ? (a, i) => app.fragment(a, i, null) : null;
      const r = renderShaded(mesh, { width: W, height: H, eye, target, fragment: frag });
      img = { w: r.width, h: r.height, rgb: r.rgb };
    } else {
      const c = parts[1].split(',').map(Number);
      const eye = parts[2].split(',').map(Number), target = parts[3].split(',').map(Number);
      const [W, H] = (parts[4] ?? '560x380').split('x').map(Number);
      const region = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: app.apron ?? 10 }).input;
      const mesh = app.mesh(region, null, core);
      const frag = app.fragment ? (a, i) => app.fragment(a, i, null) : null;
      const r = renderShaded(mesh, { width: W, height: H, eye, target, fragment: frag });
      img = { w: r.width, h: r.height, rgb: r.rgb };
    }
    img.key = KEY[app.name] ?? [60, 180, 60];
    row.push(img);
  }
  panels.push(row);
}
const GAP = 6, BAR = 4;
const W = Math.max(...panels.map((r) => r.reduce((a, p) => a + p.w, 0) + GAP * (r.length - 1)));
const H = panels.reduce((a, r) => a + Math.max(...r.map((p) => p.h)) + BAR, 0) + GAP * (panels.length - 1);
const rgb = new Uint8Array(W * H * 3).fill(255);
let y0 = 0;
for (const row of panels) {
  let x0 = 0;
  const rh = Math.max(...row.map((p) => p.h));
  for (const p of row) {
    for (let y = 0; y < BAR; y++) for (let x = 0; x < p.w; x++) { const k = ((y0 + y) * W + x0 + x) * 3; rgb[k] = p.key[0]; rgb[k + 1] = p.key[1]; rgb[k + 2] = p.key[2]; }
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const s = (y * p.w + x) * 3, d = ((y0 + BAR + y) * W + x0 + x) * 3;
      rgb[d] = p.rgb[s]; rgb[d + 1] = p.rgb[s + 1]; rgb[d + 2] = p.rgb[s + 2];
    }
    x0 += p.w + GAP;
  }
  y0 += rh + BAR + GAP;
}
writePng(out, W, H, rgb);
console.log('wrote', out, W, 'x', H);
