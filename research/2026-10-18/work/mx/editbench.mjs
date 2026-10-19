// Edit-path cost for mx-codes vs hints (and mf-iso): REMESH-shaped inputs
// (52³, apron 10) on real terrain WITH player edits (team gh's scenarios:
// mountain road/mound/pit/terrace/wall, single placed block, town, and a
// house on the corner x = z = 32 dirtying 8 chunks). Interleaved, min of N.
// Also times the mx code pass alone (prep + codes + texels) on the same inputs.
//   node work/mx/editbench.mjs [--n 9]
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { buildScenarios, SEED } from '../gh/editscenes.mjs';
import * as hints from '../../approaches/hints.mjs';
import * as mx from '../../approaches/mx-codes.mjs';
import * as mf from '../../approaches/mf-iso.mjs';
import { prep, computeCodes, buildTexels } from './prod.mjs';
const args = process.argv.slice(2);
const ni = args.indexOf('--n');
const N = ni >= 0 ? Number(args[ni + 1]) : 9;
const scen = buildScenarios();
const apps = [['hints', hints], ['mx-codes', mx], ['mf-iso', mf]];
const inputs = {};
for (const [s, sc] of Object.entries(scen)) {
  inputs[s] = {};
  for (const [, a] of apps) {
    const A = a.apron ?? 10;
    if (!inputs[s][A]) inputs[s][A] = sc.chunks.map((c) => buildGenMeshInput(SEED, c[0], c[1], c[2], sc.edits, { forceApron: A }).input);
  }
}
const codePass = (inp) => { const P = prep(inp); const { codes } = computeCodes(P, mx.OPTS); buildTexels(P, codes, 3); return codes.length / 6; };
const best = {};
const nCodes = {};
for (let r = 0; r < N; r++) {
  for (const s of Object.keys(scen)) {
    for (const [name, a] of [...apps, ['codepass', null]]) {
      const list = inputs[s][a ? a.apron ?? 10 : 10];
      for (let ci = 0; ci < list.length; ci++) {
        const t0 = performance.now();
        if (a) a.mesh(list[ci], null, core); else nCodes[`${s}|${ci}`] = codePass(list[ci]);
        const t = performance.now() - t0;
        const k = `${name}|${s}|${ci}`;
        if (!(k in best) || t < best[k]) best[k] = t;
      }
    }
  }
}
console.log(`mesh() per dirty chunk, min of ${N} interleaved runs, ms (corner×8: sum / max of the 8 chunks):`);
const cols = Object.keys(scen);
console.log('variant'.padEnd(12) + cols.map((c) => c.padEnd(20)).join(''));
for (const name of [...apps.map((a) => a[0]), 'codepass']) {
  const cells = cols.map((s) => {
    const len = scen[s].chunks.length;
    const ts = Array.from({ length: len }, (_, ci) => best[`${name}|${s}|${ci}`]);
    return len === 1 ? ts[0].toFixed(2) : `${ts.reduce((p, q) => p + q, 0).toFixed(1)} / ${Math.max(...ts).toFixed(2)}`;
  });
  console.log(name.padEnd(12) + cells.map((c) => c.padEnd(20)).join(''));
}
console.log('codes per chunk: ' + cols.map((s) => `${s} ${scen[s].chunks.map((_, ci) => nCodes[`${s}|${ci}`]).join('/')}`).join('; '));
process.exit(0);
