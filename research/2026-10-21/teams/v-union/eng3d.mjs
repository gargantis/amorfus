// 3D attack runs (engine lib/mbo.mjs). Per run: every X edge's verdict (merge
// bookkeeping + geometric pieces), per-material roots at the end.
// node eng3d.mjs <case> [n=16] [variants=j0,s1,s2,s3,annNM] [regime=FREE]
import { writeFileSync, mkdirSync } from 'node:fs';
import { xList, runEngine, outcome, phaseSummary, swapAB, A, B, C } from './vu.mjs';
import * as K from './cfg-v.mjs';
import { byName } from '../../lib/configs.mjs';
const box = (x0, y0, z0, x1, y1, z1, m) => { const o = []; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) o.push([x, y, z, m]); return o; };
const lineA = (L) => Array.from({ length: L }, (_, k) => [k, 0, k, A]);
const CASES = {
  'cube2-checker': () => byName('cube2-checker').blocks,
  'W1-3d': () => K.to3(K.W1()),
  'W1-3d-2high': () => { const b = K.to3(K.W1()); return [...b, ...b.map(([x, , z, m]) => [x, 1, z, m])]; },
  // A diagonal line on y=0, B anti-diagonal line on y=1 crossing above it, in air
  'cross-heights-air': () => [...lineA(6), ...Array.from({ length: 6 }, (_, k) => [k, 1, 5 - k, B])],
  // same, inside a 6x2x6 slab of C (C fills every other cell)
  'cross-heights-C': () => { const m = new Map(); for (const b of box(0, 0, 0, 5, 1, 5, C)) m.set(`${b[0]},${b[1]},${b[2]}`, b); for (const b of lineA(6)) m.set(`${b[0]},${b[1]},${b[2]}`, b); for (let k = 0; k < 6; k++) m.set(`${k},1,${5 - k}`, [k, 1, 5 - k, B]); return [...m.values()]; },
  // 3D crossing with an X between the lines: A rises along (y,z)=(k,k) at x=0..1? (vertical-plane LX): A at (0,k,k), B at (0,k,3-k)
  'LX-vertical': () => [...Array.from({ length: 4 }, (_, k) => [0, k, k, A]), ...Array.from({ length: 4 }, (_, k) => [0, k, 3 - k, B]).filter((b) => !(b[1] === b[2]))],
  'slab-line': () => byName('slab-line').blocks,
  'L2-3d': () => K.to3(K.L2()),
  'L2-shortA-3d': () => K.to3(K.L2({ kA: [0, 1], tB: [-4, 5] })),
  'LX-10x4-3d': () => K.to3(K.LX({ nA: 10, nB: 4 })),
  'LX-6x6-3d': () => K.to3(K.LX()),
  // corner-only pairs of four materials around one vertex (every interior edge is an ABCD X)
  'cube2-cornerA': () => box(0, 0, 0, 1, 1, 1, B).map((b) => ((b[0] + b[1] + b[2]) % 3 === 0 ? [b[0], b[1], b[2], A] : b)),
  'diag-corner': () => byName('diag-corner').blocks,
  'cube2-corner4': () => [[0, 0, 0, A], [1, 1, 1, A], [1, 0, 0, B], [0, 1, 1, B], [0, 1, 0, C], [1, 0, 1, C], [0, 0, 1, 4], [1, 1, 0, 4]],
};
const [name, nA, varA, regA] = process.argv.slice(2);
const n = nA ? +nA : 16;
const REG = { FREE: { maxSteps: 300 }, 'FINITE-4': { maxSteps: 4, stopAfter: 99 }, 'CAGE-0.25': { anchor: { kind: 'cage', r: 0.25 }, maxSteps: 300 } };
const regName = regA ?? 'FREE';
const variants = (varA ?? 'j0,s1,s2,s3,annNM1,annNM2,annNM3').split(',');
const blocks0 = CASES[name]();
const X = xList(blocks0);
const out = { case: name, n, regime: regName, xs: X.xs.map((x) => ({ at: x.at, axis: x.axis, mats: x.pairs.map((p) => p.mat), sizes: x.pairs.map((p) => p.sizes), n: x.n, rule4: x.rule4, size: x.size })), runs: [] };
console.log(name, blocks0.length, 'blocks;', X.xs.length, 'X edges');
for (const x of out.xs) console.log('  X', JSON.stringify(x));
mkdirSync(new URL('./e3d/', import.meta.url), { recursive: true });
for (const v of variants) {
  const opts = { n, ...REG[regName] };
  let run = {};
  if (v === 'j0') opts.jitter = 0;
  else if (v === 'rev') opts.jitter = 0;
  else if (v.startsWith('annNM')) { opts.seed = +v.slice(5); run = { anneal: { amp: 0.1, steps: 100, noMerge: true }, quenchSteps: 250 }; }
  else if (v.startsWith('ann')) { opts.seed = +v.slice(3); run = { anneal: { amp: 0.1, steps: 100 }, quenchSteps: 250 }; }
  else { opts.jitter = 1e-3; opts.seed = +v.slice(1); }
  const blocks = v === 'rev' ? blocks0.slice().reverse() : blocks0;
  const Xv = v === 'rev' ? xList(blocks) : X;
  const sim = runEngine(blocks, opts, run);
  const oc = outcome(sim, Xv.xs);
  const ph = phaseSummary(sim);
  const roots = {}; for (const p of ph) (roots[p.mat] ??= []).push(`${p.blocks}${p.pieces > 1 ? `[${p.pieces}pc]` : ''}`);
  const firsts = oc.map((o) => o.first);
  const rec = { v, steps: sim.steps, converged: !!sim.converged, ms: sim.ms, xs: oc.map((o) => `${o.at.map((t) => +t.toFixed(1)).join(',')}:${o.first}${o.verdict !== o.first ? '(end ' + o.verdict + ')' : ''}${o.geo !== o.verdict ? '/g' + o.geo : ''}`), roots, firstMerges: sim.mergeLog.slice(0, 8).map((m) => m.t) };
  out.runs.push(rec);
  console.log(`${v.padEnd(7)} ${rec.steps} st ${rec.ms} ms | roots ${JSON.stringify(roots)} | merges at ${rec.firstMerges.join(',')}`);
  console.log('     X verdicts', rec.xs.join(' '));
  writeFileSync(new URL(`./e3d/${name}-${regName}-n${n}.json`, import.meta.url), JSON.stringify(out, null, 1));
}
