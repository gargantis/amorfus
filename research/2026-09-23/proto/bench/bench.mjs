import { makeGen, surfaceNets } from './voxel.mjs';
import { performance } from 'node:perf_hooks';

const gen = makeGen(12345);
const AREA = 256; // blocks square sample area
const YMIN = -32, YMAX = 128;

function run(S, coarse) {
  const cols = AREA / S;
  const layers = [];
  for (let cy = Math.floor(YMIN / S); cy * S < YMAX; cy++) layers.push(cy);
  let tGen = 0, tMesh = 0, nChunks = 0, nUniform = 0, nMeshed = 0, quads = 0, verts = 0, maxMesh = 0, maxGen = 0;
  const meshTimes = [];
  for (let cz = 0; cz < cols; cz++) for (let cx = 0; cx < cols; cx++) for (const cy of layers) {
    let t0 = performance.now();
    const g = gen(cx, cy, cz, S, 1, coarse);
    let t1 = performance.now();
    tGen += t1 - t0; maxGen = Math.max(maxGen, t1 - t0); nChunks++;
    if (g.uniform >= 0) { nUniform++; continue; }
    t0 = performance.now();
    const m = surfaceNets(g.data, S);
    t1 = performance.now();
    tMesh += t1 - t0; meshTimes.push(t1 - t0); maxMesh = Math.max(maxMesh, t1 - t0);
    if (m.quads > 0) { nMeshed++; quads += m.quads; verts += m.nv; }
  }
  meshTimes.sort((a, b) => a - b);
  const p = q => meshTimes[Math.floor(q * (meshTimes.length - 1))];
  return { S, coarse, nChunks, nUniform, nonUniform: nChunks - nUniform, nMeshed,
    genMsPerChunk: +(tGen / nChunks).toFixed(3), genMsPerNonUniform: +(tGen / (nChunks - nUniform)).toFixed(3), maxGen: +maxGen.toFixed(2),
    meshMsMean: +(tMesh / meshTimes.length).toFixed(3), meshP50: +p(0.5).toFixed(3), meshP95: +p(0.95).toFixed(3), maxMesh: +maxMesh.toFixed(2),
    quadsPerMeshedChunk: Math.round(quads / nMeshed), vertsPerMeshedChunk: Math.round(verts / nMeshed),
    quadsPerColumnArea_perBlock2: +(quads / (AREA * AREA)).toFixed(3),
    meshedChunksPerColumn: +(nMeshed / (cols * cols)).toFixed(2),
    nonUniformPerColumn: +((nChunks - nUniform) / (cols * cols)).toFixed(2) };
}

// warm-up JIT
run(32, true); run(16, true);
for (const S of [16, 32]) for (const coarse of [false, true]) console.log(JSON.stringify(run(S, coarse)));
