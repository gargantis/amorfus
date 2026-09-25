import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
const w = new Worker(`const { parentPort } = require('node:worker_threads');
parentPort.on('message', (m) => { if (m.transfer) parentPort.postMessage(m, [m.buf]); else parentPort.postMessage({ok:1}); });`, { eval: true });
const once = () => new Promise(r => w.once('message', r));
async function rt(bytes, transfer, n = 300) {
  const ts = [];
  for (let i = 0; i < n; i++) {
    const buf = new ArrayBuffer(bytes);
    const t0 = performance.now();
    const p = once();
    if (transfer) w.postMessage({ buf, transfer: true }, [buf]); else w.postMessage({ buf, transfer: false });
    await p; ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  return { bytes, transfer, p50: +ts[n >> 1].toFixed(3), p95: +ts[Math.floor(n * 0.95)].toFixed(3) };
}
for (const b of [16, 78608, 262144, 1 << 20]) { await rt(b, false, 50); console.log(JSON.stringify(await rt(b, false))); console.log(JSON.stringify(await rt(b, true))); }
// assemble padded 34^3 from 27 neighbour 32^3 chunks
const S = 32, N = 34;
const nb = Array.from({ length: 27 }, () => new Uint16Array(S * S * S).fill(1));
const out = new Uint16Array(N * N * N);
function assemble() {
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) {
    const gz = z - 1, gy = y - 1;
    const cz = gz < 0 ? 0 : gz >= S ? 2 : 1, cy = gy < 0 ? 0 : gy >= S ? 2 : 1;
    const lz = (gz + S) % S, ly = (gy + S) % S;
    // left apron, middle run, right apron
    out[(z * N + y) * N] = nb[(cz * 3 + cy) * 3 + 0][(lz * S + ly) * S + S - 1];
    out.set(nb[(cz * 3 + cy) * 3 + 1].subarray((lz * S + ly) * S, (lz * S + ly) * S + S), (z * N + y) * N + 1);
    out[(z * N + y) * N + N - 1] = nb[(cz * 3 + cy) * 3 + 2][(lz * S + ly) * S];
  }
}
for (let i = 0; i < 200; i++) assemble();
const t0 = performance.now(); for (let i = 0; i < 1000; i++) assemble(); console.log('assemble34^3 ms', ((performance.now() - t0) / 1000).toFixed(4));
await w.terminate();
