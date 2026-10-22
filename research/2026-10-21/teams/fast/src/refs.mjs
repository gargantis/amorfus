// Physics references: run a regime on catalogue configurations with the
// shared engine (lib/mbo.mjs, unchanged) and cache the final labels and phase
// state (gzip) so analyses can rebuild the finished sim (finish()) without
// re-running the dynamics.
//   node refs.mjs <REGIME> <names|all>
// REGIME: FID-0.15 | FINITE-T | NOVOL-T | FREE
// n = 16 except ball-r2 / ball-AB (n = 12: their n = 16 grid is 1.4 M cells).
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, setup, finish, DEFAULTS, volumes } from '../../../lib/mbo.mjs';
import { CONFIGS, byName } from '../../../lib/configs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE = join(HERE, '..', 'refcache');

export function regimeOpts(name) {
  let m;
  if ((m = /^FID-([\d.]+)$/.exec(name))) return { anchor: { kind: 'fidelity', k: Number(m[1]) } };
  if ((m = /^FINITE-(\d+)$/.exec(name))) return { maxSteps: Number(m[1]), stopAfter: 99 };
  if ((m = /^NOVOL-(\d+)$/.exec(name))) return { volume: false, maxSteps: Number(m[1]), stopAfter: 99 };
  if (name === 'FREE') return { maxSteps: 300 };
  throw new Error(`regime ${name}`);
}
export const nFor = (cfgName) => (cfgName === 'ball-r2' || cfgName === 'ball-AB' ? 12 : 16);

export function cachePath(regime, name) { return join(CACHE, regime, name); }

export function runAndCache(regime, cfg) {
  const opts = { ...regimeOpts(regime), n: nFor(cfg.name) };
  const t0 = performance.now();
  const sim = simulate(cfg.blocks, opts);
  const ms = performance.now() - t0;
  const p = cachePath(regime, cfg.name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p + '.label.gz', gzipSync(Buffer.from(sim.label.buffer, sim.label.byteOffset, sim.label.byteLength)));
  const meta = {
    regime, name: cfg.name, opts, ms: Math.round(ms), steps: sim.steps, converged: !!sim.converged,
    lastChanges: sim.history.slice(-5), grid: [sim.NX, sim.NY, sim.NZ], n: sim.n,
    root: sim.root,
    phases: sim.phases.map((P) => ({ mat: P.mat, blocks: P.blocks, target: P.target, lambda: P.lambda, alive: P.alive })),
    volumes: volumes(sim).map((v) => ({ ...v, volume: +v.volume.toFixed(4) })),
  };
  writeFileSync(p + '.json', JSON.stringify(meta));
  return { sim, meta };
}

/** Rebuild a finished sim from the cache (labels + phase state → finish). */
export function loadRef(regime, cfg) {
  const p = cachePath(regime, cfg.name);
  const meta = JSON.parse(readFileSync(p + '.json', 'utf8'));
  const o = { ...DEFAULTS, ...meta.opts };
  const sim = setup(cfg.blocks, o);
  sim.opts = o;
  const lab = gunzipSync(readFileSync(p + '.label.gz'));
  sim.label.set(new Uint8Array(lab.buffer, lab.byteOffset, lab.byteLength));
  meta.phases.forEach((Q, i) => { const P = sim.phases[i]; P.target = Q.target; P.lambda = Q.lambda; P.alive = Q.alive; P.blocks = Q.blocks; });
  sim.root = meta.root.slice();
  sim.steps = meta.steps; sim.converged = meta.converged; sim.history = meta.lastChanges;
  finish(sim, o);
  return { sim, meta };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [regime, names = 'all'] = process.argv.slice(2);
  const pick = names === 'all' ? CONFIGS : names.split(',').map((n) => byName(n));
  for (const cfg of pick) {
    if (existsSync(cachePath(regime, cfg.name) + '.json') && !process.env.FORCE) { console.log(`${cfg.name}: cached`); continue; }
    const { meta } = runAndCache(regime, cfg);
    console.log(`${regime} ${cfg.name}: n ${meta.n} grid ${meta.grid.join('x')} ${meta.ms} ms, ${meta.steps} steps${meta.converged ? '' : ' (not converged)'}, ` +
      meta.volumes.map((v) => `${v.mat}:${v.blocks}->${v.volume}`).join(' ') + `, rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  }
}
