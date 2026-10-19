#!/usr/bin/env node
// Interleaved, min-of-N timing on real terrain, so machine load hits every
// approach equally:  node harness/timing.mjs [--n 9] a.mjs b.mjs …
// Uses GEN_MESH input at each approach's own apron (no edits), 16 chunks.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from './core.mjs';
import { buildGenMeshInput } from '../lib/gen-mesh.mjs';
const args = process.argv.slice(2);
const ni = args.indexOf('--n');
const N = ni >= 0 ? Number(args[ni + 1]) : 9;
const files = args.filter((a, i) => a.endsWith('.mjs') && !(ni >= 0 && i === ni + 1));
const apps = [];
for (const f of files) apps.push(await import(pathToFileURL(resolve(f)).href));
const CHUNKS = [
  [-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2],
  [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1],
];
const inputs = apps.map((a) => CHUNKS.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: a.apron ?? 10 }).input));
const best = apps.map(() => CHUNKS.map(() => Infinity));
for (let r = 0; r < N; r++) {
  for (let ci = 0; ci < CHUNKS.length; ci++) {
    for (let ai = 0; ai < apps.length; ai++) {
      const t0 = performance.now();
      apps[ai].mesh(inputs[ai][ci], null, core);
      const t = performance.now() - t0;
      if (t < best[ai][ci]) best[ai][ci] = t;
    }
  }
}
for (let ai = 0; ai < apps.length; ai++) {
  const xs = best[ai].slice().sort((a, b) => a - b);
  const sum = xs.reduce((a, b) => a + b, 0);
  console.log(`${apps[ai].name.padEnd(16)} mesh only, min of ${N}: mean ${(sum / xs.length).toFixed(2)} ms, median ${xs[xs.length >> 1].toFixed(2)} ms, max ${xs[xs.length - 1].toFixed(2)} ms (apron ${apps[ai].apron ?? 10})`);
}
