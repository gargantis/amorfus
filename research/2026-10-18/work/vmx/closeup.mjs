#!/usr/bin/env node
// vmx: one close-up camera of a scene, hints | mf-iso | mx | mx diagnostic.
//   node work/vmx/closeup.mjs <scene> <ex,ey,ez> <tx,ty,tz> <out-name> [WxH]
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as core from '../../harness/core.mjs';
import { findScene } from './scenes.mjs';
import { loadApproach, renderShaded, hcat, save, ROOT } from '../vmf/lib.mjs';
import { VMX, gpuData, makeDiag } from './diaglib.mjs';
const [name, e, t, outName, wh = '480x320'] = process.argv.slice(2);
const sc = findScene(name);
const cam = { eye: e.split(',').map(Number), target: t.split(',').map(Number) };
const [W, H] = wh.split('x').map(Number);
const HI = await loadApproach('approaches/hints.mjs');
const MF = await loadApproach('approaches/mf-iso.mjs');
const mH = HI.mesh(core.buildRegion(sc.cell, 10), null, core);
const mF = MF.mesh(core.buildRegion(sc.cell, MF.apron), null, core);
const region = core.buildRegion(sc.cell, VMX.apron);
const mX = VMX.mesh(region, null, core);
const { G } = gpuData(region);
const d1 = makeDiag(region, mX, G, 'mat'), d2 = makeDiag(region, mX, G, 'diag');
const imgs = [renderShaded(mH, { ...cam, width: W, height: H }), renderShaded(mF, { ...cam, width: W, height: H, fragment: (a, i) => MF.fragment(a, i, null) }),
  renderShaded(mX, { ...cam, width: W, height: H, fragment: d1.fn }), renderShaded(mX, { ...cam, width: W, height: H, fragment: d2.fn })];
mkdirSync(join(ROOT, 'out', 'vmx-diag'), { recursive: true });
save(join(ROOT, 'out', 'vmx-diag', `${outName}.png`), hcat(imgs, 4));
const s = d1.st;
console.log(`${name} ${outName}: frags ${s.frags}, shown≠own ${(100 * s.differs / s.frags).toFixed(2)}%, FOREIGN ${(100 * s.foreign / s.frags).toFixed(3)}%, far ${(100 * s.far / s.frags).toFixed(3)}%, replica≠target ${s.mismatch}`);
console.log('  e.g.', JSON.stringify(s.examples.slice(0, 3)));
