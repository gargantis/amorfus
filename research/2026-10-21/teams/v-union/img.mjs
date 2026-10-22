// Images for the v-union report. 2D: engine labels (phys labimg/labtools, read-only
// imports) with the exact solver's films overlaid in white; 3D: lib/render slices.
import { mkdirSync, writeFileSync } from 'node:fs';
import { runEngine, finish } from './vu.mjs';
import { foam, CFG2 } from './foamrun.mjs';
import { labelImage } from '../phys/labtools.mjs';
import { drawLabels, savePng as savePng2 } from '../phys/labimg.mjs';
import { renderSlice, renderView, blocksSlice, savePng } from '../../lib/render.mjs';
import { byName } from '../../lib/configs.mjs';
import { blockBounds } from '../../lib/run.mjs';
const D = new URL('./img/', import.meta.url).pathname;
mkdirSync(D, { recursive: true });
const items = [];
function two(name, file, { steps = 12, g = 1, sb = 0.2, n = 32, foamT = 1, overlay = true, anneal = null, label }) {
  const blocks = CFG2[name]();
  const sim = runEngine(blocks, { dims: 2, n, s: sb * n, g, maxSteps: steps, stopAfter: 99 }, anneal ? { anneal, quenchSteps: steps } : {});
  finish(sim, sim.opts);
  const ov = [];
  if (overlay) { const r = foam(blocks, { g, maxTime: foamT, h: 0.03 }); for (const p of r.F.polylines()) ov.push({ pts: p.pts, color: [255, 255, 255] }); }
  const img = labelImage(sim);
  const scale = Math.max(1, Math.round(300 / Math.max(img.w, img.h)));
  savePng2(D + file, drawLabels(sim, img, { scale, overlays: ov }));
  items.push({ path: D + file, label });
  // blocks picture
  return sim;
}
function blocks2(name, file, label) {
  const blocks = CFG2[name]();
  const sim = runEngine(blocks, { dims: 2, n: 8, maxSteps: 0 });
  finish(sim, sim.opts);
  savePng(D + file, blocksSlice(blocks, sim, { axis: 2, at: 0, ppb: 30 }));
  items.push({ path: D + file, label });
}
blocks2('W1', 'W1-blocks.png', 'W1 blocks (X at centre)\nrule4: A (window A4<B8); size: B');
two('W1', 'W1-engine12.png', { label: 'W1, engine FREE 12 steps n32\nB (2x2) unites 12/12; exact films white: B' });
blocks2('L2', 'L2-blocks.png', 'L2: A domino line x B single line\nrule4: none (4 v 4); size: B');
two('L2', 'L2-engine12.png', { label: 'L2, engine FREE 12 steps n32\nB singles cut the A line 12/12; exact B' });
blocks2('L2-shortA', 'L2shortA-blocks.png', 'L2-shortA: 2 A dominoes x 10 B singles\nrule4: none; size: B');
two('L2-shortA', 'L2shortA-engine12.png', { label: 'L2-shortA, engine FREE 12 steps\nA dominoes (larger) unite 12/12' });
blocks2('LX-10x4', 'LX104-blocks.png', 'LX-10x4: single-block lines, A 10, B 4\nrule4: none; sizes tie');
two('LX-10x4', 'LX104-engine12.png', { label: 'LX-10x4, engine: B 12/12 (white: exact\nsolver A 64/64, a pre-split tie)' });
two('diagEdgeDiff', 'dediff-g1.5-s0.2.png', { g: 1.5, steps: 80, n: 64, label: 'diag-edge-diff g 1.5, engine FREE s 0.2\nadheres (film 1.08); exact: apart' });
two('L3ABC', 'L3ABC-g1.3-s0.1.png', { g: 1.3, steps: 120, n: 64, sb: 0.1, label: 'L3-ABC g 1.3, engine FREE s 0.1: B|C film\nexact (white): A|air, B and C apart' });
two('W1', 'W1-ann0.1.png', { steps: 150, overlay: false, anneal: { amp: 0.1, steps: 100 }, label: 'W1, prior anneal 0.1x100 + quench\nboth pairs merged at step 1; A in 2 pieces' });
// 3D
function three(cfgName, file, opts, sl, label, run = {}) {
  const blocks = byName(cfgName).blocks;
  const sim = runEngine(blocks, { n: 16, maxSteps: 300, ...opts }, run);
  finish(sim, sim.opts);
  for (const [i, s] of sl.entries()) { const f = file.replace('.png', sl.length > 1 ? `-${i}.png` : '.png'); savePng(D + f, renderSlice(sim, { ...s, ppb: 60 })); items.push({ path: D + f, label: Array.isArray(label) ? label[i] : label }); }
  return sim;
}
three('cube2-checker', 'cube2chk-s4.png', { jitter: 1e-3, seed: 4 }, [{ axis: 1, at: 0.5 }], 'cube2-checker FREE jitter 1e-3 seed 4, plan y 0.5\nfrozen at step 14: 8 bubbles, X lines kept');
three('cube2-checker', 'cube2chk-j0.png', { jitter: 0 }, [{ axis: 1, at: 0.5 }], 'cube2-checker FREE jitter 0, plan y 0.5\nboth pairs united (A4, B4)');
three('sq2-checker', 'sq2chk3d-s2.png', { jitter: 1e-3, seed: 2 }, [{ axis: 1, at: 0.15 }, { axis: 1, at: 0.85 }], ['sq2-checker 3D FREE seed 2, plan y 0.15\nB connected across the X', 'same run, plan y 0.85\nA connected: both unite by layering']);
{
  const blocks = byName('diag-corner').blocks;
  const sim = runEngine(blocks, { n: 16, maxSteps: 250, seed: 1 }, { anneal: { amp: 0.1, steps: 100 }, quenchSteps: 250 });
  finish(sim, sim.opts);
  savePng(D + 'diagcorner-ann.png', renderView(sim, { bounds: blockBounds(blocks), width: 320, height: 240 }));
  items.push({ path: D + 'diagcorner-ann.png', label: 'diag-corner (corner-only), prior anneal\nmerged at step 1 -> one bubble (3/3 seeds)' });
}
writeFileSync(new URL('./img/sheet-spec.json', import.meta.url), JSON.stringify({ out: D + 'v-union-sheet.png', cols: 4, title: 'v-union: attacks on the X-junction union rule (labels = engine; white = exact 2D solver films)', cell: [300, 300], items }, null, 1));
console.log(items.length, 'images');
