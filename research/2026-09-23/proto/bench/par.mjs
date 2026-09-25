import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
if (isMainThread) {
  const S = 32, cols = 12; // 12x12 columns = 384x384 blocks, y layers -1..3
  const jobs = []; for (let cz = 0; cz < cols; cz++) for (let cx = 0; cx < cols; cx++) for (let cy = -1; cy < 4; cy++) jobs.push([cx, cy, cz]);
  for (const W of [1, 2, 4, 6, 10]) {
    const ws = Array.from({ length: W }, () => new Worker(new URL(import.meta.url), { workerData: { S } }));
    await Promise.all(ws.map(w => new Promise(r => { w.once('message', r); w.postMessage({ warm: true }); })));
    let next = 0, done = 0; const per = []; let nonUni = 0;
    const t0 = performance.now();
    await new Promise(res => {
      const feed = (w) => { if (next < jobs.length) w.postMessage({ job: jobs[next++] }); };
      for (const w of ws) { w.on('message', m => { per.push(m.ms); if (!m.uniform) nonUni++; done++; if (done === jobs.length) res(); else feed(w); }); feed(w); }
    });
    const wall = performance.now() - t0;
    const nu = per.filter((_, i) => true);
    per.sort((a, b) => a - b);
    console.log(JSON.stringify({ workers: W, jobs: jobs.length, nonUniform: nonUni, wallMs: Math.round(wall), chunksPerSec: Math.round(jobs.length / wall * 1000), jobP50: +per[per.length >> 1].toFixed(2), jobP95: +per[Math.floor(per.length * 0.95)].toFixed(2), jobMax: +per[per.length - 1].toFixed(2) }));
    await Promise.all(ws.map(w => w.terminate()));
  }
} else {
  const { makeGen, surfaceNetsFast } = await import('./voxel.mjs');
  const gen = makeGen(12345); const scratch = {}; const S = workerData.S;
  parentPort.on('message', (m) => {
    if (m.warm) { for (let i = 0; i < 30; i++) { const g = gen(i, 1, i, S, 1, true); if (g.uniform < 0) surfaceNetsFast(g.data, S, scratch); } parentPort.postMessage({}); return; }
    const t0 = performance.now();
    const [cx, cy, cz] = m.job; const g = gen(cx + 100, cy, cz + 100, S, 1, true);
    let q = 0; if (g.uniform < 0) q = surfaceNetsFast(g.data, S, scratch).quads;
    parentPort.postMessage({ ms: performance.now() - t0, uniform: g.uniform >= 0, q });
  });
}
