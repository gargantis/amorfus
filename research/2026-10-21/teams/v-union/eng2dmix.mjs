// Mixed-material X junctions (tension not tied): engine 2D FREE over g and s_b,
// and the exact solver over g. Per run: contact (film length, blocks) between
// the named phases at the end, and whether the same-material pair (if any) united.
// node eng2dmix.mjs <case> <gs> <sbs> [n=64]
import { writeFileSync, mkdirSync } from 'node:fs';
import { runEngine, contact, phaseSummary, xList } from './vu.mjs';
import { foam, CFG2 } from './foamrun.mjs';
import { clusters } from '../../lib/mbo.mjs';
const [name, gsA, sbsA, nA] = process.argv.slice(2);
const gs = gsA.split(',').map(Number), sbs = sbsA.split(',').map(Number), n = nA ? +nA : 64;
const blocks = CFG2[name]();
const { phaseOfBlock } = clusters(blocks, 2);
const ph = (x, y) => phaseOfBlock[blocks.findIndex((b) => b[0] === x && b[1] === y)];
// the pairs to watch per case: [label, p, q]
const WATCH = {
  diagEdgeDiff: [['A|B film', ph(0, 1), ph(1, 0)]],
  L3ABC: [['B|C film', ph(1, 0), ph(0, 1)]],
  ABACbig: [['B|C film', ph(-1, 0), ph(0, -1)], ['A pair', ph(0, 0), ph(-1, -1)]],
}[name];
const out = { case: name, n, engine: [], solver: [] };
mkdirSync(new URL('./mix/', import.meta.url), { recursive: true });
for (const g of gs) {
  // exact solver
  const S = foam(blocks, { g, maxTime: 2, h: 0.03 });
  const dec = S.events.filter((e) => e.kind === 'decide').map((e) => ({ at: e.at, t: e.t, pick: e.pick, options: e.options }));
  out.solver.push({ g, decisions: dec, adjacency: S.adjacency, E: S.res.E });
  console.log(`solver g ${g}: ${dec.map((d) => `[${d.at}] t ${d.t} pick ${d.pick.join('')} (${d.options.map((o) => o.mats.join('') + ':' + o.rate).join(' ')})`).join('; ')} adj ${S.adjacency.join(',')}`);
  for (const sb of sbs) for (const jit of [0, 1e-3]) {
    const sim = runEngine(blocks, { dims: 2, n, s: sb * n, g, maxSteps: 400, jitter: jit, seed: 1 });
    const w = WATCH.map(([lab, p, q]) => ({ lab, contactBlocks: +(contact(sim, p, q) / n).toFixed(3) }));
    const rec = { g, s_b: sb, jitter: jit, steps: sim.steps, converged: !!sim.converged, watch: w, phases: phaseSummary(sim).map((p) => `${p.mat}:${p.blocks}${p.pieces > 1 ? `[${p.pieces}pc]` : ''}`).join(' ') };
    out.engine.push(rec);
    console.log(`  engine g ${g} s ${sb} j ${jit}: ${w.map((x) => `${x.lab} ${x.contactBlocks}`).join(', ')} | ${rec.phases} | ${rec.steps} st`);
    writeFileSync(new URL(`./mix/${name}-n${n}.json`, import.meta.url), JSON.stringify(out, null, 1));
  }
}
