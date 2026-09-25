import { makeGen, surfaceNets, surfaceNetsFast } from './voxel.mjs';
import { performance } from 'node:perf_hooks';
const gen = makeGen(12345);
for (const S of [16, 32, 64]) {
  const chunks = [];
  const cols = 256 / S;
  for (let cz = 0; cz < cols; cz++) for (let cx = 0; cx < cols; cx++) for (let cy = Math.floor(-32 / S); cy * S < 128; cy++) {
    const g = gen(cx, cy, cz, S, 1, true); if (g.uniform < 0) chunks.push(g.data);
  }
  const scratch = {};
  for (let r = 0; r < 3; r++) for (const d of chunks) surfaceNetsFast(d, S, scratch); // warm
  const ts = []; let q = 0, v = 0;
  for (const d of chunks) { const t0 = performance.now(); const m = surfaceNetsFast(d, S, scratch); ts.push(performance.now() - t0); q += m.quads; v += m.nv; }
  // cross-check against naive
  let mismatch = 0; for (const d of chunks.slice(0, 20)) { if (surfaceNets(d, S).quads !== surfaceNetsFast(d, S, scratch).quads) mismatch++; }
  ts.sort((a, b) => a - b);
  const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
  console.log(JSON.stringify({ S, nonUniformChunks: chunks.length, fastMeanMs: +mean.toFixed(3), p50: +ts[ts.length >> 1].toFixed(3), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(3), max: +ts[ts.length - 1].toFixed(3), nsPerVoxel: +(mean * 1e6 / S ** 3).toFixed(1), avgQuads: Math.round(q / chunks.length), avgVerts: Math.round(v / chunks.length), mismatchVsNaive: mismatch }));
}
