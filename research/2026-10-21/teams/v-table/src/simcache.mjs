// v-table: run the physics on scenes and cache the final labels and the
// render field D (team table's engine copy src/mbo-clamp.mjs via sim.mjs:
// clamp-to-edge blur, bbox, 'world' cluster pre-merge), so the mesh scoring
// never re-simulates.
//   node src/simcache.mjs <set> <regime> <n> <names|all> [--force]
// Writes cache/<regime>-n<n>/<name>.{json,D.gz,L.gz}
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { simulateScene, REGIMES as TREG } from '../../table/src/sim.mjs';
// team table's regimes plus no-volume variants (T5 check)
const REGIMES = { ...TREG, 'FINITE-4-nv': { ...TREG['FINITE-4'], volume: false }, 'FID-0.15-nv': { ...TREG['FID-0.15'], volume: false } };
import { sceneSet } from './scenes.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
export const cacheDir = (regime, n) => `${ROOT}cache/${regime}-n${n}`;

export function loadCache(regime, n, name) {
  const base = `${cacheDir(regime, n)}/${name}`;
  const meta = JSON.parse(readFileSync(base + '.json', 'utf8'));
  const Dq = gunzipSync(readFileSync(base + '.D.gz'));
  const D16 = new Int16Array(Dq.buffer, Dq.byteOffset, Dq.byteLength / 2);
  const D = new Float32Array(D16.length);
  for (let i = 0; i < D.length; i++) D[i] = D16[i] / meta.dScale;
  const Lb = gunzipSync(readFileSync(base + '.L.gz'));
  const label = new Uint8Array(Lb.buffer, Lb.byteOffset, Lb.byteLength);
  return { ...meta.grid, meta, D, label };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [set, regime, nS, names] = process.argv.slice(2);
  const n = +nS;
  const force = process.argv.includes('--force');
  let scenes = sceneSet(set);
  if (names !== 'all') { const want = names.split(','); scenes = scenes.filter((s) => want.includes(s.name)); }
  const dir = cacheDir(regime, n);
  mkdirSync(dir, { recursive: true });
  for (const sc of scenes) {
    const base = `${dir}/${sc.name}`;
    if (existsSync(base + '.json') && !force) { console.log(`${sc.name}: cached`); continue; }
    const t0 = performance.now();
    const sim = simulateScene(sc.blocks, { ...REGIMES[regime], n, margin: 0, bbox: sc.bbox }, sc.group);
    const ms = Math.round(performance.now() - t0);
    let mx = 0;
    for (let i = 0; i < sim.D.length; i++) mx = Math.max(mx, Math.abs(sim.D[i]));
    const dScale = Math.floor(32000 / Math.max(1, mx));
    const D16 = new Int16Array(sim.D.length);
    for (let i = 0; i < D16.length; i++) D16[i] = Math.round(sim.D[i] * dScale);
    writeFileSync(base + '.D.gz', gzipSync(Buffer.from(D16.buffer)));
    writeFileSync(base + '.L.gz', gzipSync(Buffer.from(sim.label.buffer, sim.label.byteOffset, sim.label.byteLength)));
    const origin = sc.bbox.slice(0, 3), size = [0, 1, 2].map((t) => sc.bbox[t + 3] - sc.bbox[t] + 1);
    const meta = {
      set, name: sc.name, regime, n, ms, steps: sim.steps, converged: !!sim.converged, changes: sim.history.reduce((a, b) => a + b, 0),
      premerged: sim.premerged ?? 0, alive: sim.phases.filter((P, p) => p && P.alive).length,
      lambda: sim.phases.filter((P, p) => p && P.alive).map((P) => [P.mat, P.blocks, +P.lambda.toFixed(4)]),
      phaseMat: sim.phases.map((P, p) => (p && P.alive ? P.mat : 0)),
      grid: { NX: sim.NX, NY: sim.NY, NZ: sim.NZ, n: sim.n, ox: sim.ox, oy: sim.oy, oz: sim.oz },
      dScale, origin, size, evalLo: sc.evalLo, evalHi: sc.evalHi, blocks: sc.blocks.length,
    };
    writeFileSync(base + '.json', JSON.stringify(meta));
    console.log(`${set} ${sc.name} ${regime} n${n}: grid ${sim.NX}x${sim.NY}x${sim.NZ}, ${sim.steps} steps${sim.converged ? '' : ' (not converged)'}, ${ms} ms, rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  }
}
