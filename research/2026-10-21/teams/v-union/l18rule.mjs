// Task 4: impose a union choice on slab-line and measure the result.
// node task4rule.mjs <regime> [n=16]
//  physics : no imposed union (the engine decides)
//  ruleA   : the A diagonal pairs united at the start (the line is one cluster)
//  ruleB   : the B halves united across every X (the line is cut into dots)
// Measures connected components of each material in the final labels (face
// adjacency of sub-cells), and the neck width of A at each X junction.
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { runSim, simInfo, matGrid, fmt } from './loclib/loc.mjs';
import { renderView, renderSlice, savePng } from '../../lib/render.mjs';
import { byName } from '../../lib/configs.mjs';
const A = 6, B = 7;
const [regName, nArg, cfgName, marginArg] = process.argv.slice(2);
const N_SUB = nArg ? +nArg : 16;
const cfg = byName(cfgName ?? 'slab-line');
const blocks = cfg.blocks;
const L = 6;
const pairsA = []; for (let i = 0; i < L - 1; i++) pairsA.push([[i, 0, i], [i + 1, 0, i + 1]]);
const pairsB = []; for (let i = 0; i < L - 1; i++) pairsB.push([[i + 1, 0, i], [i, 0, i + 1]]);
function components(sim, mat) {
  const m = matGrid(sim); const { NX, NY, NZ, N } = sim; const seen = new Uint8Array(N); let comps = 0; const sizes = [];
  const q = new Int32Array(N);
  for (let c0 = 0; c0 < N; c0++) {
    if (seen[c0] || m[c0] !== mat) continue;
    comps++; let h = 0, t = 0; q[t++] = c0; seen[c0] = 1; let sz = 0;
    while (h < t) {
      const c = q[h++]; sz++;
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      const nb = [];
      if (i > 0) nb.push(c - 1); if (i < NX - 1) nb.push(c + 1); if (j > 0) nb.push(c - NX); if (j < NY - 1) nb.push(c + NX);
      if (k > 0) nb.push(c - NX * NY); if (k < NZ - 1) nb.push(c + NX * NY);
      for (const c2 of nb) if (!seen[c2] && m[c2] === mat) { seen[c2] = 1; q[t++] = c2; }
    }
    sizes.push(+(sz / sim.cellVol).toFixed(3));
  }
  return { comps, sizes: sizes.sort((a, b) => b - a).slice(0, 8) };
}
// neck: at the X point (i+1, y, i+1), the A extent along the anti-diagonal direction (1,0,-1)/sqrt2, at mid-height
function necks(sim) {
  const m = matGrid(sim); const { NX, NY, n, ox, oy, oz } = sim;
  const at = (x, y, z) => { const i = Math.floor((x - ox) * n), j = Math.floor((y - oy) * n), k = Math.floor((z - oz) * n); return m[(k * NY + j) * NX + i]; };
  const out = [];
  for (let i = 0; i < L - 1; i++) {
    const cx = i + 1, cz = i + 1; let w = 0; const st = 0.5 / n;
    for (const y of [0.5]) {
      let lo = 0, hi = 0;
      for (let t = 0; t < 1.5; t += st) { if (at(cx + t / Math.SQRT2, y, cz - t / Math.SQRT2) === A) hi = t; else break; }
      for (let t = 0; t < 1.5; t += st) { if (at(cx - t / Math.SQRT2, y, cz + t / Math.SQRT2) === A) lo = t; else break; }
      w = at(cx, y, cz) === A ? lo + hi : 0;
    }
    out.push(+w.toFixed(3));
  }
  return out;
}
mkdirSync(new URL('./l18', import.meta.url), { recursive: true });
mkdirSync(new URL('./l18/img', import.meta.url), { recursive: true });
const outPath = new URL(`./l18/rule-${cfg.name}-${regName}-n${N_SUB}-m${marginArg ?? 1}.json`, import.meta.url);
const res = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { regName, cfg: cfg.name, n: N_SUB, runs: {} };
for (const [v, extra] of [['physics', {}], ['ruleA', { unitePairs: pairsA }], ['ruleB', { unitePairs: pairsB }]]) {
  const sim = runSim(blocks, regName, { n: N_SUB, ...(marginArg ? { margin: +marginArg } : {}), ...extra });
  const info = simInfo(sim);
  const cA = components(sim, A), cB = components(sim, B), nk = necks(sim);
  res.runs[v] = { info, compA: cA, compB: cB, necksA: nk };
  console.log(`${cfg.name} ${regName} ${v}: ${sim.ms} ms ${sim.steps} st${sim.converged ? '' : ' NC'} | phases ${info.phases.map((p) => `${p.mat}:${p.blocks}->${p.volume}`).join(' ')} | A comps ${cA.comps} ${JSON.stringify(cA.sizes)} | B comps ${cB.comps} | A necks at X ${JSON.stringify(nk)}`);
  const bounds = { min: [0, 0, 0], max: [6, 1, 6] };
  savePng(new URL(`./l18/img/${cfg.name}-${regName}-n${N_SUB}-${v}-view.png`, import.meta.url).pathname, renderView(sim, { bounds, width: 360, height: 270 }));
  savePng(new URL(`./l18/img/${cfg.name}-${regName}-n${N_SUB}-${v}-plan.png`, import.meta.url).pathname, renderSlice(sim, { axis: 1, at: 0.5, ppb: 40 }));
  writeFileSync(outPath, JSON.stringify(res));
}
