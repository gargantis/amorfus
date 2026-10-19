#!/usr/bin/env node
// Production cost and the look on REAL generated terrain (seed 1,1).
//   node harness/bench.mjs approaches/<name>.mjs [--no-images]
// Meshes 16 surface chunks through approach.mesh(input, null, core) with the
// approach's apron (GEN_MESH input, no edits), reports mean/max ms,
// triangles and vertices per chunk, and renders two chunks:
// a mountainside (grass/stone/dirt) and a beach (grass/sand).
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as core from '../../../harness/core.mjs';
import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { renderShaded } from '../../../harness/raster.mjs';
import { writePng } from '../../../harness/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const approach = await import(pathToFileURL(resolve(args[0])).href);
const images = !args.includes('--no-images');
const outDir = join('work/pa/results', approach.name);
mkdirSync(join(outDir, 'img'), { recursive: true });
const SEED = [1, 1];
const apron = approach.apron ?? 10;
const CHUNKS = [
  [-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2],
  [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1],
];
const input = (c) => buildGenMeshInput(SEED, c[0], c[1], c[2], new Map(), { forceApron: apron }).input;
// warm up
approach.mesh(input(CHUNKS[0]), null, core);
const ms = [], tris = [], verts = [];
for (const c of CHUNKS) {
  const inp = input(c);
  const [m, t] = core.timed(() => approach.mesh(inp, null, core));
  ms.push(t);
  tris.push(m.T);
  verts.push(m.V);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const report = {
  chunks: CHUNKS.length, apron,
  msMean: mean(ms), msMax: Math.max(...ms),
  trianglesMean: mean(tris), verticesMean: mean(verts),
};
writeFileSync(join(outDir, 'bench.json'), JSON.stringify(report, null, 1));
console.log(`${approach.name}: ${report.msMean.toFixed(1)} ms mean, ${report.msMax.toFixed(1)} ms max per chunk (apron ${apron}); ${report.trianglesMean.toFixed(0)} triangles, ${report.verticesMean.toFixed(0)} vertices per chunk`);
if (images) {
  const VIEWS = {
    'terrain-mountain': { chunk: [-1, 1, 1], eye: [44, 40, 44], target: [14, 14, 14] },
    'terrain-beach': { chunk: [0, 0, -3], eye: [40, 34, 42], target: [15, 18, 15] },
  };
  for (const [label, v] of Object.entries(VIEWS)) {
    const mesh = approach.mesh(input(v.chunk), null, core);
    const frag = approach.fragment ? (a, i) => approach.fragment(a, i, null) : null;
    const img = renderShaded(mesh, { width: 560, height: 380, eye: v.eye, target: v.target, fragment: frag, flatShading: approach.flatShading === true });
    writePng(join(outDir, 'img', `${label}-view.png`), img.width, img.height, img.rgb);
  }
}
