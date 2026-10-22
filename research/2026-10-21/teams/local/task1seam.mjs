// Task 1 (seam probe): 14x2x4 slab, z in {0,1} = A, z in {2,3} = B, a straight
// seam along x at z = 2 (3D, n = 12). Recolour the top A block (2+d, 1, 1)
// to B (a one-block B tongue into A, touching the seam) and measure the seam
// position z_s(x) at y = 1.5 and y = 0.5, and the top surface along z = 2.
// node task1seam.mjs <regime> <d,d,...>
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { runSim, simInfo, labelDiff, surfaceShift, topD, seamsD, seamLabel, fmt } from './lib/loc.mjs';
import { finishLocal } from './lib/mbo-box.mjs';
const A = 6, B = 7;
const [regName, dl] = process.argv.slice(2);
const ds = dl.split(',').map(Number);
const N_SUB = 12, LX = 14, LZ = 4, XP = 2;
const slab = []; for (let x = 0; x < LX; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < LZ; z++) slab.push([x, y, z, z < 2 ? A : B]);
const ex = { n: N_SUB, bbox: [0, 0, 0, LX - 1, 1, LZ - 1] };
const xs = []; for (let x = 0.125; x < LX; x += 0.25) xs.push(+x.toFixed(3));
const seamProf = (sim, y) => xs.map((x) => { const s = seamsD(sim, A, B, [x, y, 0], 2, 0.3, 3.7); return s.length ? s[s.length - 1] : null; });
const seamProfL = (sim, y) => xs.map((x) => fmt(seamLabel(sim, A, B, [x, y, 0], 2, 0.3, 3.7)));
const topProf = (sim) => xs.map((x) => fmt(topD(sim, x, 2.0, 3.0, -0.5)));
const grooveZ = []; for (let z = 0.02; z < 4; z += 0.04) grooveZ.push(+z.toFixed(3));
const groove = (sim, x) => grooveZ.map((z) => fmt(topD(sim, x, z, 3.0, -0.5)));
mkdirSync(new URL('./res/t1', import.meta.url), { recursive: true });
const outPath = new URL(`./res/t1/seam-${regName}.json`, import.meta.url);
const res = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { regName, n: N_SUB, slab: [LX, 2, LZ], runs: {} };
const base = runSim(slab, regName, ex);
res.xs = xs; res.grooveZ = grooveZ;
res.base = { ...simInfo(base), seam15: seamProf(base, 1.5), seam05: seamProf(base, 0.5), seam15L: seamProfL(base, 1.5), top: topProf(base),
  groove7: groove(base, 7.0), groove1: groove(base, 1.0), groove02: groove(base, 0.2) };
finishLocal(base, base.opts);
Object.assign(res.base, { seam15_0: seamProf(base, 1.5), seam05_0: seamProf(base, 0.5), top0: topProf(base), groove7_0: groove(base, 7.0), groove1_0: groove(base, 1.0), groove02_0: groove(base, 0.2) });
const baseD0 = base.D;
console.log(regName, 'seam base', base.ms, 'ms', base.steps, 'steps', base.converged ? '' : 'NOT CONVERGED', JSON.stringify(res.base.phases), 'seam z at x=7: y1.5', res.base.seam15[28], 'y0.5', res.base.seam05[28]);
for (const d of ds) {
  const x = XP + d;
  const blocks = slab.map((b) => (b[0] === x && b[1] === 1 && b[2] === 1 ? [x, 1, 1, B] : b));
  const sim = runSim(blocks, regName, ex);
  const box = [x, 1, 1, x + 1, 2, 2];
  const ld = labelDiff(base, sim, box);
  base.D = base.Dfull;
  const ss = surfaceShift(base, sim, box, { binW: 0.5 });
  const s15 = seamProf(sim, 1.5), s05 = seamProf(sim, 0.5), s15L = seamProfL(sim, 1.5), top = topProf(sim);
  finishLocal(sim, sim.opts); base.D = baseD0;
  const ss0 = surfaceShift(base, sim, box, { binW: 0.5 });
  const s15_0 = seamProf(sim, 1.5), s05_0 = seamProf(sim, 0.5), top0 = topProf(sim);
  const pi = xs.findIndex((v) => v > XP + 0.5);
  const dz = (a, b) => (a !== null && b !== null ? fmt(a - b) : null);
  res.runs[d] = { d, info: simInfo(sim), labelDiff: ld, shiftBins: ss.bins, seam15: s15, seam05: s05, seam15L: s15L, top, shiftBins0: ss0.bins, seam15_0: s15_0, seam05_0: s05_0, top0,
    probeX: xs[pi], probeSeam15: dz(s15[pi], res.base.seam15[pi]), probeSeam05: dz(s05[pi], res.base.seam05[pi]), probeTop: dz(top[pi], res.base.top[pi]),
    probeSeam15_0: dz(s15_0[pi], res.base.seam15_0[pi]), probeSeam05_0: dz(s05_0[pi], res.base.seam05_0[pi]), probeTop0: dz(top0[pi], res.base.top0[pi]) };
  const R = res.runs[d];
  console.log(`d=${d}: ${sim.ms} ms ${sim.steps} st${sim.converged ? '' : ' NC'} | label diffs ${ld.count} max dist ${ld.maxDist} | probe dseam15 ${R.probeSeam15} dseam05 ${R.probeSeam05} dtop ${R.probeTop} | D0: dseam15 ${R.probeSeam15_0} dtop ${R.probeTop0} | lam ${R.info.phases.map((p) => p.mat + ':' + p.lamRun).join(' ')}`);
  writeFileSync(outPath, JSON.stringify(res));
}
