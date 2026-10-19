#!/usr/bin/env node
// Edit-path cost bench (team gh): REMESH-shaped inputs on REAL generated
// terrain (seed 1,1) WITH player edits, every variant timed interleaved,
// minimum of N runs per (variant, input). Generation is excluded (inputs are
// built once); it is reported separately for scale.
//   node work/gh/editbench2.mjs v1,v2,… [--n 15]
// Inputs:
//   mountain  chunk (−1,1,1): a dug 1:4 road, a built mound, a dug pit, a cut
//             terrace and a 1-thick wall (work/gh/editbench.mjs's edit set)
//   single    one placed block on the surface of chunk (1,0,0)
//   town      chunk (1,0,0) levelled to y = 16 over 28×28 and built up with
//             9 hollow 5×5 houses (doors, flat roofs) and 1:2 stairs: dense
//   corner×8  a 6×6×4 hollow house centred on the corner x = z = 32 (between
//             chunks (0|1, 0, 0|1)) — all 8 dirty chunks (cy 0 and 1), sum
//             and max of the 8 jobs
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { VARIANTS } from './variants.mjs';
const args = process.argv.slice(2);
const names = args[0].split(',');
const ni = args.indexOf('--n');
const N = ni >= 0 ? Number(args[ni + 1]) : 15;
import { buildScenarios, SEED } from './editscenes.mjs';
const scenarios = buildScenarios();
const inputs = {}; // scenario → apron → [inputs]
const genMs = {};
for (const [s, sc] of Object.entries(scenarios)) {
  inputs[s] = {};
  let count = 0;
  for (const m of sc.edits.values()) count += m.size;
  for (const n of names) {
    const A = VARIANTS[n].apron ?? 10;
    if (inputs[s][A]) continue;
    const t0 = performance.now();
    inputs[s][A] = sc.chunks.map((c) => buildGenMeshInput(SEED, c[0], c[1], c[2], sc.edits, { forceApron: A }).input);
    genMs[`${s}@${A}`] = (performance.now() - t0) / sc.chunks.length;
  }
  console.log(`${s}: ${count} edited blocks, ${sc.chunks.length} chunk(s)${sc.H !== undefined ? ` (corner house at y ${sc.H + 1})` : ''}`);
}
const best = {};
for (let r = 0; r < N; r++) {
  for (const s of Object.keys(scenarios)) {
    for (const n of names) {
      const A = VARIANTS[n].apron ?? 10;
      const list = inputs[s][A];
      for (let ci = 0; ci < list.length; ci++) {
        const t0 = performance.now();
        VARIANTS[n].raw(list[ci]);
        const t = performance.now() - t0;
        const k = `${n}|${s}|${ci}`;
        if (!(k in best) || t < best[k]) best[k] = t;
      }
    }
  }
}
console.log(`\nmesh only, min of ${N} interleaved runs (ms; generation excluded):`);
const cols = Object.keys(scenarios);
console.log('variant'.padEnd(14) + cols.map((c) => (c === 'corner×8' ? 'corner×8 sum / max' : c).padEnd(20)).join(''));
for (const n of names) {
  const cells = cols.map((s) => {
    const len = scenarios[s].chunks.length;
    const ts = Array.from({ length: len }, (_, ci) => best[`${n}|${s}|${ci}`]);
    if (len === 1) return ts[0].toFixed(2);
    return `${ts.reduce((a, b) => a + b, 0).toFixed(1)} / ${Math.max(...ts).toFixed(2)}`;
  });
  console.log(n.padEnd(14) + cells.map((c) => c.padEnd(20)).join('') + `(apron ${VARIANTS[n].apron ?? 10})`);
}
console.log('\ngeneration per chunk (single run, for scale): ' + Object.entries(genMs).map(([k, v]) => `${k} ${v.toFixed(1)} ms`).join(', '));
