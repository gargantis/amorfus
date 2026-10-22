// E2: the far-bar scene (look's WIDE host) under the physics and the cheap
// models. Physics FID-0.15 / FINITE-4 at n 12 (margin 1) and FID-0.15 at
// n 16 (margin 0.75, to stay under 1.2 M cells). For each: tunnel clearance
// (labels and render D), lambda, volume; cheap models on the same grid:
// tunnel clearance and surface distance to the physics D.
//   node e2-farbar.mjs <out.json> <imgDir> [n16]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { simulate, sampleGrid, volumes } from '../../../lib/mbo.mjs';
import { renderSlice, renderView, savePng } from '../../../lib/render.mjs';
import { fieldView, lineSet, compareSurfaces } from '../../fast/src/metrics.mjs';
import { refCm } from '../../fast/src/t2.mjs';
import { model, Dat, wideHost, bar, r4 } from './common.mjs';
import { tunnelClear } from './measure.mjs';

const [out, imgDir, which = 'n12'] = process.argv.slice(2);
mkdirSync(imgDir, { recursive: true });
const scenes = { alone: wideHost(), barAttached: [...wideHost(), ...bar(6)] };
const runs = which === 'n16'
  ? [['FID-0.15', { anchor: { kind: 'fidelity', k: 0.15 } }, 16, 0.75]]
  : [['FID-0.15', { anchor: { kind: 'fidelity', k: 0.15 } }, 12, 1.0], ['FINITE-4', { maxSteps: 4, stopAfter: 99 }, 12, 1.0]];
const res = { note: 'look WIDE host: 6x4x3 stone, 1x2 tunnel at x=1 along z; bar 1x1x4 attached at x=6..9, y=0, z=0', runs: [] };
const lines = lineSet(scenes.barAttached, 300, 7);
// lines restricted to the host region x <= 6 (the tunnel side) for a local comparison
const hostLines = lineSet(wideHost(), 300, 11);
for (const [reg, opts, n, margin] of runs) {
  for (const [name, blocks] of Object.entries(scenes)) {
    const t0 = performance.now();
    const sim = simulate(blocks, { ...opts, n, margin });
    const ms = Math.round(performance.now() - t0);
    const I = new Float32Array(sim.N);
    for (let c = 0; c < sim.N; c++) I[c] = sim.label[c] ? 1 : 0;
    const lab = (x, y, z) => sampleGrid(sim, I, x, y, z) - 0.5;
    const Dp = (x, y, z) => sampleGrid(sim, sim.D, x, y, z);
    const row = { regime: reg, n, margin, scene: name, steps: sim.steps, converged: !!sim.converged, ms, cells: sim.N,
      lambdas: sim.phases.map((P, p) => (p && P.alive ? r4(P.lambda) : null)).filter((v) => v != null),
      volumes: volumes(sim).map((v) => ({ blocks: v.blocks, volume: r4(v.volume) })),
      tunnelLabels: tunnelClear(lab), tunnelD: tunnelClear(Dp), models: {} };
    const ref = fieldView(sim, sim.D, refCm(sim));
    for (const id of ['Bl-g20', 'Bl-b1s20', 'Bx-g20']) {
      const m = model(blocks, id, n, { margin });
      const mv = fieldView(m, m.D, m.Cm);
      row.models[id] = { tunnel: tunnelClear((x, y, z) => Dat(m, x, y, z)), surfAll: compareSurfaces(ref, mv, name === 'alone' ? hostLines : lines), surfHostLines: compareSurfaces(ref, mv, hostLines) };
    }
    res.runs.push(row);
    console.log(reg, n, name, sim.steps, 'steps', ms, 'ms', 'lam', row.lambdas.join(','), '| labels', JSON.stringify({ h: row.tunnelLabels.clearH70, w: row.tunnelLabels.widthMid, hm: row.tunnelLabels.heightMid }),
      '| D', JSON.stringify({ h: row.tunnelD.clearH70, w: row.tunnelD.widthMid, hm: row.tunnelD.heightMid }),
      '|', Object.entries(row.models).map(([k, v]) => `${k} tunnel ${v.tunnel.clearH70}/${v.tunnel.widthMid}/${v.tunnel.heightMid} surf(host lines) mean ${v.surfHostLines.mean} p95 ${v.surfHostLines.p95} max ${v.surfHostLines.max}`).join(' ; '));
    savePng(join(imgDir, `farbar-${reg}-n${n}-${name}-slice.png`), renderSlice(sim, { axis: 2, at: 1.5, ppb: 36 }));
    if (n === 12) {
      savePng(join(imgDir, `farbar-${reg}-n${n}-${name}-view.png`), renderView(sim, { bounds: { min: [0, 0, 0], max: [11, 4, 3] }, width: 360, height: 240 }));
      if (reg === 'FID-0.15') {
        const m = model(blocks, 'Bl-b1s20', n, { margin });
        savePng(join(imgDir, `farbar-Bl-b1s20-${name}-slice.png`), renderSlice(m, { axis: 2, at: 1.5, ppb: 36 }));
        savePng(join(imgDir, `farbar-Bl-b1s20-${name}-view.png`), renderView(m, { bounds: { min: [0, 0, 0], max: [11, 4, 3] }, width: 360, height: 240 }));
      }
    }
    writeFileSync(out, JSON.stringify(res, null, 1));
  }
}
