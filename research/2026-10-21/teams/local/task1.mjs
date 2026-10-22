// Task 1: influence radius on a 14x2x5 A slab (3D, n = 12, see REPORT).
// node task1.mjs <regime> <kind: add|remove|recolour> <d,d,...>
// Probe: top surface above block (2, 1, 2), i.e. point (2.5, *, 2.5).
// Perturbed block at x = 2 + d on the centre row z = 2:
//   add      -> new A block at (2+d, 2, 2) on top
//   remove   -> top block (2+d, 1, 2) removed (a pit)
//   recolour -> top block (2+d, 1, 2) becomes B (an inclusion)
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { runSim, simInfo, labelDiff, surfaceShift, topD, topLabel, seamsD, fmt } from './lib/loc.mjs';
import { finishLocal } from './lib/mbo-box.mjs';
const A = 6, B = 7;
const [regName, kind, dl] = process.argv.slice(2);
const ds = dl.split(',').map(Number);
const N_SUB = 12, LX = 14, LZ = 5, XP = 2;
const slab = []; for (let x = 0; x < LX; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < LZ; z++) slab.push([x, y, z, A]);
const bbox = [0, 0, 0, LX - 1, 2, LZ - 1];
const ex = { n: N_SUB, bbox };
const perturb = (d) => {
  const x = XP + d;
  if (kind === 'add') return slab.concat([[x, 2, 2, A]]);
  if (kind === 'remove') return slab.filter((b) => !(b[0] === x && b[1] === 1 && b[2] === 2));
  if (kind === 'recolour') return slab.map((b) => (b[0] === x && b[1] === 1 && b[2] === 2 ? [x, 1, 2, B] : b));
  throw new Error(kind);
};
const xs = []; for (let x = 0.125; x < LX; x += 0.25) xs.push(+x.toFixed(3));
const profile = (sim, z) => xs.map((x) => [fmt(topD(sim, x, z, 3.6, -0.5)), fmt(topLabel(sim, x, z))]);
mkdirSync(new URL('./res/t1', import.meta.url), { recursive: true });
const outPath = new URL(`./res/t1/${regName}-${kind}.json`, import.meta.url);
const res = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { regName, kind, n: N_SUB, slab: [LX, 2, LZ], probe: [XP + 0.5, null, 2.5], runs: {} };
const base = runSim(slab, regName, ex);
res.base = { ...simInfo(base), profC: profile(base, 2.5), profE: profile(base, 0.5) };
finishLocal(base, base.opts);
res.base.profC0 = profile(base, 2.5); res.base.profE0 = profile(base, 0.5);
const baseD0 = base.D;
res.xs = xs;
console.log(regName, kind, 'base', base.ms, 'ms', base.steps, 'steps', base.converged ? '' : 'NOT CONVERGED', JSON.stringify(res.base.phases));
for (const d of ds) {
  const blocks = perturb(d);
  const sim = runSim(blocks, regName, ex);
  const x = XP + d;
  const box = kind === 'add' ? [x, 2, 2, x + 1, 3, 3] : [x, 1, 2, x + 1, 2, 3];
  const ld = labelDiff(base, sim, box);
  base.D = base.Dfull;
  const ss = surfaceShift(base, sim, box, { binW: 0.5 });
  const pc = profile(sim, 2.5), pe = profile(sim, 0.5);
  const seamsFull = kind === 'recolour' ? [1.5, 1.9].map((y) => ({ y, xs: seamsD(sim, A, B, [0, y, 2.5], 0, x - 1.5, x + 2.5) })) : null;
  finishLocal(sim, sim.opts); base.D = baseD0;
  const ss0 = surfaceShift(base, sim, box, { binW: 0.5 });
  const pc0 = profile(sim, 2.5), pe0 = profile(sim, 0.5);
  const pi = xs.indexOf(XP + 0.625) >= 0 ? xs.indexOf(XP + 0.625) : xs.findIndex((v) => v > XP + 0.5);
  const probeD = pc[pi][0] !== null && res.base.profC[pi][0] !== null ? pc[pi][0] - res.base.profC[pi][0] : null;
  const probeL = pc[pi][1] !== null && res.base.profC[pi][1] !== null ? pc[pi][1] - res.base.profC[pi][1] : null;
  const probeD0 = pc0[pi][0] !== null && res.base.profC0[pi][0] !== null ? pc0[pi][0] - res.base.profC0[pi][0] : null;
  const r = { d, info: simInfo(sim), probeX: xs[pi], probeDeltaD: fmt(probeD), probeDeltaLabel: fmt(probeL), probeDeltaD0: fmt(probeD0),
    labelDiff: ld, shiftBins: ss.bins, shiftBins0: ss0.bins, profC: pc, profE: pe, profC0: pc0, profE0: pe0 };
  if (kind === 'recolour') { r.seams = seamsFull; r.seams0 = [1.5, 1.9].map((y) => ({ y, xs: seamsD(sim, A, B, [0, y, 2.5], 0, x - 1.5, x + 2.5) })); }
  res.runs[d] = r;
  console.log(`d=${d}: ${sim.ms} ms ${sim.steps} st${sim.converged ? '' : ' NC'} | label diffs ${ld.count}, max dist ${ld.maxDist} | probe dD ${fmt(probeD)} dD0 ${fmt(probeD0)} dLab ${fmt(probeL)} | lam ${r.info.phases.map((p) => p.lamRun).join('/')} (base ${res.base.phases.map((p) => p.lamRun).join('/')})`);
  writeFileSync(outPath, JSON.stringify(res));
}
