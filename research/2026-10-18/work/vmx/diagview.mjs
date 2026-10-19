#!/usr/bin/env node
// vmx: render scenes with hints, mf-iso and mx-codes side by side, plus an
// mx DIAGNOSTIC panel: magenta = FOREIGN material (shown material exists on
// no surface block within 1 of the fragment's own block), blue = the column
// search found a block more than 1 away from the fragment's own block (the
// target's material otherwise). Prints the classification counts and checks
// that the replicated search equals the target's fragment() everywhere.
//   node work/vmx/diagview.mjs <scene>[,<scene>…] [--close] [--plan] [--out dir]
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as core from '../../harness/core.mjs';
import { findScene } from './scenes.mjs';
import { loadApproach, renderShaded, planRaster, planRgb, cropRgb, hcat, vcat, save, ROOT } from '../vmf/lib.mjs';
import { VMX, gpuData, makeDiag } from './diaglib.mjs';
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const names = args[0].split(',');
const OUT = join(ROOT, 'out', opt('--out') ?? 'vmx-diag');
mkdirSync(OUT, { recursive: true });
const H = await loadApproach('approaches/hints.mjs');
const MF = await loadApproach('approaches/mf-iso.mjs');
for (const n of names) {
  const sc = findScene(n);
  if (!sc) { console.log('no scene', n); continue; }
  const cams = [['view', sc.camera], ...(sc.closeups ?? []).map((c, k) => [`close${k}`, c])];
  const rH = core.buildRegion(sc.cell, 10);
  const mH = H.mesh(rH, null, core);
  const mF = MF.mesh(core.buildRegion(sc.cell, MF.apron), null, core);
  const mfFrag = (a, i) => MF.fragment(a, i, null);
  const rows = [];
  const tot = {};
  const region = core.buildRegion(sc.cell, VMX.apron);
  const mX = VMX.mesh(region, null, core);
  const { G, stats } = gpuData(region);
  for (const [label, cam] of cams) {
    const d1 = makeDiag(region, mX, G, 'mat');
    const d2 = makeDiag(region, mX, G, 'diag');
    const W = 480, Hh = 320;
    const row = [
      renderShaded(mH, { ...cam, width: W, height: Hh }),
      renderShaded(mF, { ...cam, width: W, height: Hh, fragment: mfFrag }),
      renderShaded(mX, { ...cam, width: W, height: Hh, fragment: d1.fn }),
      renderShaded(mX, { ...cam, width: W, height: Hh, fragment: d2.fn }),
    ];
    rows.push(hcat(row, 4));
    const s = d1.st;
    console.log(`${n} ${label}: frags ${s.frags}, shown≠own ${s.differs} (${(100 * s.differs / s.frags).toFixed(2)}%), FOREIGN ${s.foreign} (${(100 * s.foreign / s.frags).toFixed(3)}%), far-found ${s.far}, no-surface ${s.noSurface}, coded ${s.coded}, replica≠target ${s.mismatch}`);
    if (s.examples.length) console.log('  e.g.', JSON.stringify(s.examples.slice(0, 4)));
    for (const k of ['frags', 'differs', 'foreign', 'far', 'noSurface', 'coded', 'mismatch']) tot[k] = (tot[k] ?? 0) + s[k];
  }
  if (sc.plan || args.includes('--plan')) {
    const win = sc.win ?? [4, 4, 28, 28];
    const d3 = makeDiag(region, mX, G, 'diag');
    const pX = planRaster(mX, { S: 32, fragment: d3.fn });
    const pH = planRaster(mH, { S: 32 });
    const pF = planRaster(mF, { S: 32, fragment: mfFrag });
    const d4 = makeDiag(region, mX, G, 'mat');
    const pX2 = planRaster(mX, { S: 32, fragment: d4.fn });
    rows.push(hcat([pH, pF, pX2, pX].map((p) => cropRgb(planRgb(p), 32, 0, 0, win)), 4));
    console.log(`${n} plan: foreign ${d3.st.foreign}, far ${d3.st.far}, replica≠target ${d3.st.mismatch}`);
  }
  console.log(`${n}: codes ${stats.coded}, tauFallback ${stats.tauFallback}, crackMiss ${stats.crackMiss}, overflow ${stats.overflow}`);
  save(join(OUT, `${n}.png`), vcat(rows, 6));
}
