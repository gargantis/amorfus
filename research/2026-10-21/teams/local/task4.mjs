// Task 4: ambiguous contacts. Which same-material pair unites, per regime,
// with relative cluster sizes, symmetry breaking (jitter 1e-3, 3 seeds) and
// reordered blocks (reversed list -> reversed phase numbering).
// node task4.mjs <regime> <set: sizes|contacts|line> [n=16] [variants=j0,s1,s2,s3,rev]
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { runSim, simInfo } from './lib/loc.mjs';
import { byName } from '../../lib/configs.mjs';
const A = 6, B = 7;
const [regName, set, nArg, varArg] = process.argv.slice(2);
const N_SUB = nArg ? +nArg : 16;
const VARIANTS = (varArg ?? 'j0,s1,s2,s3,rev').split(',');
const plan = (rows, y = 0) => { const M = { A, B }; const o = []; rows.forEach((r, z) => [...r].forEach((ch, x) => { if (M[ch]) o.push([x, y, z, M[ch]]); })); return o; };
const box = (x0, y0, z0, x1, y1, z1, m) => { const o = []; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) o.push([x, y, z, m]); return o; };

// 2x2 checker core A(1,1) B(2,1) B(1,2) A(2,2) in a 4x4 plan; arms grow each cluster (point-symmetric pairs)
const ARMS = { A1: [[1, 0], [0, 1], [0, 0]], A2: [[2, 3], [3, 2], [3, 3]], B1: [[3, 1], [2, 0], [3, 0]], B2: [[0, 2], [1, 3], [0, 3]] };
const checker = (sa, sb, layers = 1) => {
  const cells = [[1, 1, A], [2, 2, A], [2, 1, B], [1, 2, B]];
  for (let i = 0; i < sa - 1; i++) { cells.push([...ARMS.A1[i], A], [...ARMS.A2[i], A]); }
  for (let i = 0; i < sb - 1; i++) { cells.push([...ARMS.B1[i], B], [...ARMS.B2[i], B]); }
  const o = []; for (let y = 0; y < layers; y++) for (const [x, z, m] of cells) o.push([x, y, z, m]);
  return o;
};

const SETS = {
  sizes: [[1, 1], [1, 2], [1, 4], [2, 1], [4, 1], [2, 2], [2, 4], [4, 2], [4, 4]].map(([sa, sb]) => ({ name: `checker-A${sa}-B${sb}`, blocks: checker(sa, sb), sa, sb })),
  contacts: [
    { name: 'diag-edge', blocks: byName('diag-edge').blocks },
    { name: 'diag-edge-3v3', blocks: plan(['AA..', 'A.AA', '..A.']), note: 'two L-trominoes (3 blocks each) touching along one edge: (1,0)-(2,1)' },
    { name: 'diag-edge-3v1', blocks: plan(['AA.', 'A.A']), note: 'an L-tromino and a single block touching along one edge: (1,0)-(2,1)' },
    { name: 'diag-corner', blocks: byName('diag-corner').blocks },
    { name: 'cube2-checker', blocks: byName('cube2-checker').blocks },
    { name: 'cube2-cornerA', blocks: box(0, 0, 0, 1, 1, 1, B).map((b) => ((b[0] + b[1] + b[2]) % 3 === 0 ? [b[0], b[1], b[2], A] : b)), note: 'A at (0,0,0) and (1,1,1), corner contact only; B the other six (one cluster)' },
    { name: 'cube2-edgeA', blocks: box(0, 0, 0, 1, 1, 1, B).map((b) => (b[2] === 0 && b[0] === b[1] ? [b[0], b[1], b[2], A] : b)), note: 'A at (0,0,0) and (1,1,0), edge contact only; B the other six' },
    { name: 'checker-2layer', blocks: checker(1, 1, 2), note: 'sq2-checker two layers high (the X is a 2-long edge)' },
  ],
  line: [
    { name: 'slab-line', blocks: byName('slab-line').blocks },
    { name: 'slab-line-2high', blocks: [...byName('slab-line').blocks, ...byName('slab-line').blocks.map(([x, , z, m]) => [x, 1, z, m])] },
    { name: 'slab-line4', blocks: plan(['ABBB', 'BABB', 'BBAB', 'BBBA']) },
    { name: 'slab-antiline', blocks: byName('slab-line').blocks.map(([x, y, z, m]) => [x, y, z, m === A ? B : A]), note: 'colours swapped: B line in an A field' },
  ],
};

function outcome(sim) {
  // starting clusters per material vs live phases at the end
  const start = {}, end = {};
  for (let p = 1; p < sim.phases.length; p++) { const m = sim.phases[p].mat; start[m] = (start[m] ?? 0) + 1; if (sim.phases[p].alive) end[m] = (end[m] ?? 0) + 1; }
  return { start, end };
}

mkdirSync(new URL('./res/t4', import.meta.url), { recursive: true });
const outPath = new URL(`./res/t4/${set}-${regName}-n${N_SUB}.json`, import.meta.url);
const res = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { regName, set, n: N_SUB, runs: {} };
const only = process.argv[6] ? process.argv[6].split(',') : null;
for (const c of SETS[set]) {
  if (only && !only.includes(c.name)) continue;
  for (const v of VARIANTS) {
    const extra = { n: N_SUB };
    let blocks = c.blocks;
    if (v === 'rev') blocks = blocks.slice().reverse();
    else if (v !== 'j0') { extra.jitter = 1e-3; extra.seed = +v.slice(1); }
    const sim = runSim(blocks, regName, extra);
    const oc = outcome(sim);
    const info = simInfo(sim);
    res.runs[`${c.name}|${v}`] = { name: c.name, variant: v, note: c.note, sa: c.sa, sb: c.sb, nBlocks: blocks.length, info, outcome: oc };
    console.log(`${c.name} ${v}: ${sim.ms} ms ${sim.steps} st${sim.converged ? '' : ' NC'} | A ${oc.start[A] ?? 0}->${oc.end[A] ?? 0} B ${oc.start[B] ?? 0}->${oc.end[B] ?? 0} | ${info.phases.map((p) => `${p.mat}:${p.blocks} lam ${p.lamRun}`).join(' ')}`);
    writeFileSync(outPath, JSON.stringify(res));
  }
}
