// E3: the one-step models on configurations outside the catalogue the local
// lambda was fitted on. Physics FID-0.15 (engine unchanged) on the same grid;
// models Bx-g20 (exact per-material lambda), Bl-g20 and Bl-b1s20 (local
// lambda), A0-g20 (lambda 0). Surface distance to the physics render field D
// (fast's metrics, 300 lines, seed 7), volume error per material and per
// cluster (smooth sub-cell indicator, fast's fracVolumes).
//   node e3-newcfg.mjs <out.json> <imgDir> [names]
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { simulate, volumes } from '../../../lib/mbo.mjs';
import { renderView, savePng } from '../../../lib/render.mjs';
import { fieldView, lineSet, compareSurfaces } from '../../fast/src/metrics.mjs';
import { refCm, ownerOfCm } from '../../fast/src/t2.mjs';
import { model, fracVolumes, r4 } from './common.mjs';
import { newConfigs, newConfigs2 } from './scenes.mjs';

const [out, imgDir, names] = process.argv.slice(2);
mkdirSync(imgDir, { recursive: true });
const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { note: 'FID-0.15 physics vs one-step models on new configurations', runs: {} };
const cfgs = (process.env.SET === '2' ? newConfigs2() : newConfigs()).filter((c) => !names || names.split(',').includes(c.name));
for (const cfg of cfgs) {
  if (res.runs[cfg.name]) { console.log(cfg.name, 'done'); continue; }
  const t0 = performance.now();
  const sim = simulate(cfg.blocks, { anchor: { kind: 'fidelity', k: 0.15 }, n: cfg.n, maxSteps: 200 });
  const ms = Math.round(performance.now() - t0);
  const ref = fieldView(sim, sim.D, refCm(sim));
  const lines = lineSet(cfg.blocks, 300, 7);
  const blocksByMat = {};
  for (const b of cfg.blocks) blocksByMat[b[3]] = (blocksByMat[b[3]] ?? 0) + 1;
  const row = { n: cfg.n, origin: cfg.origin ?? null, blocks: cfg.blocks.length, blocksByMat, cells: sim.N, steps: sim.steps, converged: !!sim.converged, ms,
    physics: volumes(sim).map((v) => ({ mat: v.mat, blocks: v.blocks, volume: r4(v.volume), lambda: r4(sim.phases[v.p].lambda) })), models: {} };
  for (const id of ['Bx-g20', 'Bl-g20', 'Bl-b1s20', 'A0-g20']) {
    const m = model(cfg.blocks, id, cfg.n);
    const mv = fieldView(m, m.D, m.Cm);
    const surf = compareSurfaces(ref, mv, lines);
    const volMat = fracVolumes(m, m.D, ownerOfCm(m.Cm));
    const volErrMat = {};
    for (const k of Object.keys(blocksByMat)) volErrMat[k] = r4(((volMat[k] ?? 0) - blocksByMat[k]) / blocksByMat[k]);
    // per cluster (block clusters, engine numbering): owner = the model's best phase
    const volClu = fracVolumes(m, m.D, (c) => m.bestPh[c]);
    const clu = [];
    for (let p = 1; p < m.P.length; p++) clu.push({ p, mat: m.P[p].mat, blocks: m.P[p].blocks, err: r4(((volClu[p] ?? 0) - m.P[p].blocks) / m.P[p].blocks) });
    const worstClu = clu.reduce((a, b) => (Math.abs(b.err) > Math.abs(a.err) ? b : a), clu[0]);
    row.models[id] = { surf, volErrMat, worstCluster: worstClu, clusters: clu.length > 12 ? clu.filter((q) => q.blocks > 2 || Math.abs(q.err) > 0.1) : clu };
    console.log(`${cfg.name} ${id}: surf mean ${surf.mean} p95 ${surf.p95} max ${surf.max} unm ${surf.unmatched} bias ${surf.bias} | volMat ${JSON.stringify(volErrMat)} | worst cluster ${JSON.stringify(worstClu)}`);
    if (id === 'Bl-b1s20') savePng(join(imgDir, `${cfg.name}-Bl-b1s20-view.png`), renderView(m, { width: 300, height: 220 }));
  }
  savePng(join(imgDir, `${cfg.name}-FID-0.15-view.png`), renderView(sim, { width: 300, height: 220 }));
  res.runs[cfg.name] = row;
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(`  ${cfg.name}: n ${cfg.n} cells ${sim.N} steps ${sim.steps}${sim.converged ? '' : ' (nc)'} ${ms} ms, rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB; physics ${JSON.stringify(row.physics.slice(0, 6))}`);
}
