#!/usr/bin/env node
// vmx (copy of work/vmf/run-adv.mjs, outputs redirected to out/vmx-adv and work/vmx): run adversarial scenes through several approaches (default hints and
// mf-iso), write side-by-side images (left → right in the order given) to
// out/vmf-adv/ and a metrics JSON to work/vmf/adv-results.json.
//   node work/vmf/run-adv.mjs [--only a,b] [--apron N] [approaches/x.mjs …]
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { ADV_SCENES } from '../vmf/adv-scenes.mjs';
import { core, loadApproach, planRaster, planRgb, hcat, vcat, save, matStats, planCounts, planParts, cropRgb, renderShaded, ROOT } from '../vmf/lib.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--only')?.split(',');
const apron = Number(opt('--apron') ?? 10);
const files = args.filter((a, i) => a.endsWith('.mjs') && args[i - 1] !== '--only');
const paths = files.length ? files : ['approaches/hints.mjs', 'approaches/mf-iso.mjs', 'approaches/vmx-codes.mjs'];
const apps = [];
for (const p of paths) apps.push(await loadApproach(p));
const OUT = join(ROOT, 'out', 'vmx-adv');
mkdirSync(OUT, { recursive: true });
const resPath = join(ROOT, 'work', 'vmx', 'adv-results.json');
const results = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')) : {};
const NAMES = ['air', 'grass', 'dirt', 'stone', 'sand', 'planks', 'brick', 'r7'];
for (const sc of ADV_SCENES) {
  if (only && !only.includes(sc.name)) continue;
  const region = core.buildRegion(sc.cell, apron);
  const per = {};
  const planImgs = [], views = [], closes = (sc.closeups ?? []).map(() => []);
  for (const A of apps) {
    const mesh = A.mesh(region, null, core);
    const frag = A.fragment ? (a, i) => A.fragment(a, i, null) : null;
    const r = { T: mesh.T, V: mesh.V, mfStats: mesh.mfStats ?? null };
    if (sc.plan) {
      const img = planRaster(mesh, { S: 32, fragment: frag });
      const st = matStats(img, sc.win);
      const cells = planCounts(sc.plan, sc.win);
      const pp = planParts(sc.plan, sc.win);
      r.area = {}; r.parts = {};
      for (let m = 1; m < 8; m++) {
        if (cells[m] === 0 && st.area[m] < 0.01) continue;
        r.area[NAMES[m]] = { shown: +st.area[m].toFixed(3), cells: cells[m], ratio: cells[m] ? +(st.area[m] / cells[m]).toFixed(3) : null };
        r.parts[NAMES[m]] = { shown: st.parts[m], cells: pp[m], specks: st.specks[m] };
      }
      planImgs.push(cropRgb(planRgb(img), 32, 0, 0, sc.win));
    }
    views.push(renderShaded(mesh, { ...sc.camera, width: 480, height: 320, fragment: frag }));
    (sc.closeups ?? []).forEach((c, k) => closes[k].push(renderShaded(mesh, { ...c, width: 480, height: 320, fragment: frag })));
    per[A.name] = r;
  }
  if (planImgs.length) save(join(OUT, `${sc.name}-plan.png`), hcat(planImgs));
  save(join(OUT, `${sc.name}-view.png`), hcat(views));
  closes.forEach((row, k) => save(join(OUT, `${sc.name}-close${k}.png`), hcat(row)));
  results[sc.name] = per;
  console.log(sc.name, JSON.stringify(per));
}
writeFileSync(resPath, JSON.stringify(results, null, 1));
