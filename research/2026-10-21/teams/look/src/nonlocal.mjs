// Is the shape local? The same tunnel, alone / with a 1×3 pillar attached on
// its roof at the far corner (same cluster) / with the same pillar detached
// by a 1-block air gap (separate cluster). Regimes from sweep.mjs.
//   node --max-old-space-size=700 src/nonlocal.mjs <REGIME,…> <out.json> <imgDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { simulate } from '../../../lib/mbo.mjs';
import { simulate as simulateLook } from './mbo-look.mjs';
import { renderView, renderSlice, savePng } from '../../../lib/render.mjs';
import { byName } from '../../../lib/configs.mjs';
import { REGIMES } from './sweep.mjs';
import * as M from './lm.mjs';
const [regs, outPath, imgDir] = process.argv.slice(2);
mkdirSync(imgDir, { recursive: true });
const T = byName('tunnel').blocks, S = 3;
const FAR = process.env.FAR === '1', WIDE = process.env.WIDE === '1';
// FAR: a 1×1 bar lying on the ground along +x, its far end 4–7 blocks from the tunnel axis
const bar = (x0) => [0, 1, 2, 3].map((i) => [x0 + i, 0, 0, S]);
// WIDE: host 6×4×3 stone with the tunnel at x = 1; a 1×1×4 bar attached at the far side x = 6 (≥ 4 blocks from the tunnel wall)
const host = [];
for (let x = 0; x < 6; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 3; z++) if (!(x === 1 && (y === 1 || y === 2))) host.push([x, y, z, S]);
const scenes = WIDE ? { alone: host, barAttached: [...host, ...bar(6)], barDetached: [...host, ...bar(7)] } : FAR ? { alone: T, barAttached: [...T, ...bar(3)], barDetached: [...T, ...bar(4)] } : {
  alone: T,
  attached: [...T, [0, 4, 0, S], [0, 5, 0, S], [0, 6, 0, S]],
  detached: [...T, [0, 5, 0, S], [0, 6, 0, S], [0, 7, 0, S]],
};
const bounds = WIDE ? { min: [0, 0, 0], max: [11, 4, 3] } : FAR ? { min: [0, 0, 0], max: [8, 4, 3] } : { min: [0, 0, 0], max: [3, 8, 3] };
const res = [];
// host region compared between scenes: x 0–3 (FAR) or 0–6 (WIDE), y 0–4, z 0–3, ±0.5, sampled at sub-cell centres
const hostHi = WIDE ? 6 : 3;
function diffCells(a, b) {
  let d = 0, d1 = 0, maxDist = 0; const h = 1 / a.n; const bins = [0, 0, 0, 0]; // distance from the attachment face x = hostHi: <0.5, 0.5–1.5, 1.5–2.5, ≥2.5
  for (let x = -0.5 + h / 2; x < hostHi + 0.5; x += h) for (let y = -0.5 + h / 2; y < 4.5; y += h) for (let z = -0.5 + h / 2; z < 3.5; z += h) {
    if (M.matAt(a, x, y, z) !== M.matAt(b, x, y, z)) { d++; const dist = Math.max(0, hostHi - x); if (x < 3) d1++; maxDist = Math.max(maxDist, dist); bins[dist < 0.5 ? 0 : dist < 1.5 ? 1 : dist < 2.5 ? 2 : 3] += h * h * h; }
  }
  return { cellsChanged: d, volumeChanged: d * h * h * h, volumeByDistanceFromAttachment: { lt0_5: bins[0], '0_5to1_5': bins[1], '1_5to2_5': bins[2], ge2_5: bins[3] }, maxDistance: maxDist };
}
for (const regName of regs.split(',')) {
  const { engine, ...o } = REGIMES[regName];
  let alone = null;
  for (const [name, blocks] of Object.entries(scenes)) {
    const t0 = performance.now();
    const oo = WIDE ? { ...o, n: 12 } : o;
    const sim = engine === 'look' ? simulateLook(blocks, oo) : simulate(blocks, oo);
    const F = M.fields(sim);
    if (name === 'alone') alone = sim;
    const r = { regime: regName, scene: name, vsAlone: name === 'alone' ? null : diffCells(alone, sim), steps: sim.steps, ms: Math.round(performance.now() - t0), cells: sim.N,
      lambdas: sim.phases.map((P, p) => (p && P.alive ? +P.lambda.toFixed(4) : null)).filter((v) => v != null),
      clearCells: M.tunnelClearCells(sim, 1.5, 2.0, 0.5, 2.5),
      floor: (() => { const c = F.lab(1.5, 2, 1.5) > 0 ? null : M.crossing(F.lab, [1.5, 2, 1.5], [0, -1, 0], 3); return c ? +c.p[1].toFixed(4) : null; })(),
      roof: (() => { const c = F.lab(1.5, 2, 1.5) > 0 ? null : M.crossing(F.lab, [1.5, 2, 1.5], [0, 1, 0], 3); return c ? +c.p[1].toFixed(4) : null; })(),
      outerTopY: +M.topY(F.lab, 2.5, 2.5, 4.5, 2).toFixed(4) };
    res.push(r);
    console.log(JSON.stringify(r));
    savePng(join(imgDir, `${WIDE ? 'wide-' : ''}${regName}-${name}-view.png`), renderView(sim, { bounds, width: FAR || WIDE ? 360 : 240, height: FAR || WIDE ? 240 : 320 }));
    savePng(join(imgDir, `${WIDE ? 'wide-' : ''}${regName}-${name}-slice.png`), renderSlice(sim, { axis: 2, at: 1.5, ppb: 40 }));
    writeFileSync(outPath, JSON.stringify({ note: 'tunnel alone / with an attached 1x3 pillar on the roof corner / with the pillar detached by a 1-block gap', runs: res }, null, 1));
  }
}
