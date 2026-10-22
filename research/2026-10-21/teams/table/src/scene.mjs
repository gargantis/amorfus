// Step 3b: full simulations of whole scenes, measured corner by corner and
// compared with the table entries.
//   node src/scene.mjs <set> <regime> <n> [from-to]
// set: cat      the shared catalogue (lib/configs.mjs), margin 1 (as lib)
//      terrain  9x8x9 windows of generated terrain (seed [1,1]) on the 16
//               bench chunks, 2 per chunk, clamped boundary (margin 0), plus
//               4 shifted twins for a reproducibility check
//      builds   windows of the synthetic builds (src/builds.mjs), clamped
// Terrain and builds use 'world' clusters: phases that are face-connected
// in a larger region around the window start merged (a window cut must not
// split a bubble). Evaluated corners: every surface corner (cat), or those
// at least 2 blocks inside the window (terrain, builds).
// Writes res/scenes/<set>_<regime>_n<n>.json (merged by scene name).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { simulateScene, measureCorner, bevelVertex, seamDist, dist3, REGIMES } from './sim.mjs';
import { buildClassTable, classOf, symPointInv } from './lattice.mjs';
import { CONFIGS } from '../../../lib/configs.mjs';
import { generateRegion } from '../gen.mjs';
import { BUILDS } from './builds.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const T = buildClassTable();

// ---------- scenes ----------
export const BENCH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2],
  [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const W = [9, 8, 9];
const APRON = 12;

/** Dense block source -> scene: blocks list, groups ('world' clusters). */
function windowScene(name, get, origin, size, regionLo, regionHi) {
  // world clusters by union-find over the larger region
  const [ax, ay, az] = regionLo, [bx, by, bz] = regionHi;
  const NX = bx - ax, NY = by - ay, NZ = bz - az;
  const idx = (x, y, z) => ((y - ay) * NZ + (z - az)) * NX + (x - ax);
  const par = new Int32Array(NX * NY * NZ).map((_, i) => i);
  const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let y = ay; y < by; y++) for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) {
    const m = get(x, y, z);
    if (!m) continue;
    if (x + 1 < bx && get(x + 1, y, z) === m) par[f(idx(x + 1, y, z))] = f(idx(x, y, z));
    if (y + 1 < by && get(x, y + 1, z) === m) par[f(idx(x, y + 1, z))] = f(idx(x, y, z));
    if (z + 1 < bz && get(x, y, z + 1) === m) par[f(idx(x, y, z + 1))] = f(idx(x, y, z));
  }
  const blocks = [];
  for (let y = origin[1]; y < origin[1] + size[1]; y++) for (let z = origin[2]; z < origin[2] + size[2]; z++) for (let x = origin[0]; x < origin[0] + size[0]; x++) {
    const m = get(x, y, z);
    if (m) blocks.push([x, y, z, m]);
  }
  const group = (b) => f(idx(b[0], b[1], b[2]));
  const bbox = [origin[0], origin[1], origin[2], origin[0] + size[0] - 1, origin[1] + size[1] - 1, origin[2] + size[2] - 1];
  const evalLo = origin.map((o) => o + 2), evalHi = origin.map((o, t) => o + size[t] - 2);
  return { name, blocks, group, get, bbox, evalLo, evalHi, clamp: true };
}

export function terrainScenes() {
  // per bench chunk: 2 windows centred on random surface corners (a sample
  // weighted like the corner population) and 1 on a random seam corner (air
  // + >= 2 materials); the first 4 'a' windows get a twin shifted (2, 0, 2)
  const out = [];
  let seed = 12345;
  const rnd = (k) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return Math.floor((seed / 4294967296) * k); };
  const make = (name, C) => {
    const O = [C[0] - 4, C[1] - 4, C[2] - 4];
    const lo = O.map((v) => v - APRON), size = W.map((v) => v + 2 * APRON);
    const R = generateRegion([1, 1], lo[0], lo[1], lo[2], size[0], size[1], size[2]);
    const get = (x, y, z) => {
      const i = x - lo[0], j = y - lo[1], k = z - lo[2];
      if (i < 0 || j < 0 || k < 0 || i >= R.nx || j >= R.ny || k >= R.nz) return 0;
      return R.blocks[(j * R.nz + k) * R.nx + i] & 0xff;
    };
    out.push(windowScene(name, get, O, W, lo, lo.map((v, t) => v + size[t])));
  };
  BENCH.forEach((c, ci) => {
    const r = generateRegion([1, 1], c[0] * 32 - 1, c[1] * 32 - 1, c[2] * 32 - 1, 33, 33, 33);
    const get = (x, y, z) => r.blocks[((y + 1) * 33 + (z + 1)) * 33 + (x + 1)] & 0xff;
    const surf = [], seam = [];
    for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
      let air = false; const ms = new Set();
      for (let b = 0; b < 8; b++) { const v = get(x - 1 + (b & 1), y - 1 + ((b >> 2) & 1), z - 1 + ((b >> 1) & 1)); if (v) ms.add(v); else air = true; }
      if (!air || !ms.size) continue;
      const w = [c[0] * 32 + x, c[1] * 32 + y, c[2] * 32 + z];
      surf.push(w); if (ms.size >= 2) seam.push(w);
    }
    const A = surf[rnd(surf.length)], B = surf[rnd(surf.length)];
    make(`t${ci}a`, A); make(`t${ci}b`, B);
    if (seam.length) make(`t${ci}s`, seam[rnd(seam.length)]);
    if (ci < 4) make(`t${ci}a-shift`, [A[0] + 2, A[1], A[2] + 2]);
  });
  return out;
}

export function buildScenes() {
  const crops = { house: [2, 3, 2], stairs: [2, 3, 1], painted: [3, 0, 3], checker: [1, 1, 1], walls: [1, 3, 1] };
  const sizes = { house: [9, 8, 9], stairs: [9, 8, 9], painted: [10, 6, 10], checker: [10, 7, 10], walls: [9, 7, 10] };
  return Object.entries(BUILDS).map(([name, mk]) => {
    const G = mk();
    return windowScene(`b-${name}`, G.at, crops[name], sizes[name], [0, 0, 0], [G.NX, G.NY, G.NZ]);
  });
}

export function catScenes() {
  return CONFIGS.map((cfg) => {
    const map = new Map(cfg.blocks.map((b) => [`${b[0]},${b[1]},${b[2]}`, b[3]]));
    const get = (x, y, z) => map.get(`${x},${y},${z}`) ?? 0;
    const lo = [0, 1, 2].map((t) => Math.min(...cfg.blocks.map((b) => b[t])));
    const hi = [0, 1, 2].map((t) => Math.max(...cfg.blocks.map((b) => b[t])) + 1);
    return { name: cfg.name, blocks: cfg.blocks, group: null, get, bbox: null, evalLo: lo, evalHi: hi, clamp: false };
  });
}

export function sceneByName(set, name) {
  const list = set === 'cat' ? catScenes() : set === 'terrain' ? terrainScenes() : buildScenes();
  return list.find((s) => s.name === name);
}

// ---------- tables for the comparison ----------
function loadTables(regName) {
  const dir = ROOT + 'res/table';
  const out = {};
  for (const f of readdirSync(dir)) {
    if (!f.startsWith(regName + '_')) continue;
    const t = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    out[`${t.emb}-n${t.n}-${t.sem}`] = t.entries;
  }
  return out;
}

// ---------- main ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const [set, regName, nStr, range] = process.argv.slice(2);
  const n = +nStr;
  let scenes = set === 'cat' ? catScenes() : set === 'terrain' ? terrainScenes() : buildScenes();
  if (range) { const [a, b] = range.split('-').map(Number); scenes = scenes.slice(a, b); }
  const tables = loadTables(regName);
  const outDir = ROOT + 'res/scenes';
  mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/${set}_${regName}_n${n}.json`;
  const res = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { set, regime: regName, n, scenes: {} };
  const r4 = (v) => (v ? v.map((x) => +x.toFixed(4)) : null);
  for (const sc of scenes) {
    if (res.scenes[sc.name] && !process.argv.includes('--redo')) continue; // resume
    const t0 = performance.now();
    const opts = { ...REGIMES[regName], n, ...(sc.clamp ? { margin: 0, bbox: sc.bbox } : { margin: 1 }) };
    const sim = simulateScene(sc.blocks, opts, sc.group);
    const tSim = performance.now() - t0;
    const corners = [];
    for (let y = sc.evalLo[1]; y <= sc.evalHi[1]; y++) for (let z = sc.evalLo[2]; z <= sc.evalHi[2]; z++) for (let x = sc.evalLo[0]; x <= sc.evalHi[0]; x++) {
      const lab8 = [];
      for (let b = 0; b < 8; b++) lab8.push(sc.get(x - 1 + (b & 1), y - 1 + ((b >> 2) & 1), z - 1 + ((b >> 1) & 1)));
      if (!lab8.some((v) => v) || lab8.every((v) => v)) continue;
      // 4x4x4 window, index ((wy*4 + wz)*4 + wx), w = -2..1 around the corner
      let lab64 = '';
      for (let wy = -2; wy < 2; wy++) for (let wz = -2; wz < 2; wz++) for (let wx = -2; wx < 2; wx++) lab64 += sc.get(x + wx, y + wy, z + wz);
      const C = [x, y, z];
      const m = measureCorner(sim, C, lab8);
      const { cls, g } = classOf(T, lab8);
      const rec = { c: C, lab64, cls, g, nCross: m.nCross };
      if (m.ok) {
        const seamy = (m.seamInCell ?? 0) > 0;
        const vref = seamy && m.vseam ? m.vseam : m.vsn;
        Object.assign(rec, { vsn: r4(m.vsn), vseam: r4(m.vseam), seamIn: m.seamInCell, vref: r4(vref), projOk: m.projOk,
          vmat: Object.fromEntries(Object.entries(m.vmat ?? {}).map(([k, v]) => [k, r4(v)])) });
        const cand = { blocks: [0, 0, 0], bevel: bevelVertex(lab8) };
        for (const [tn, entries] of Object.entries(tables)) {
          const e = entries[cls];
          if (!e || !e.vsn) continue;
          cand[tn] = symPointInv(g, e.vseam && e.seamInCell ? e.vseam : e.vsn);
        }
        rec.err = {};
        for (const [cn, v] of Object.entries(cand)) {
          rec.err[cn] = [+m.surfDist(v).toFixed(4), +dist3(v, vref).toFixed(4), seamy ? +seamDist(m, v).toFixed(4) : null];
        }
      }
      corners.push(rec);
    }
    const ms = Math.round(performance.now() - t0);
    res.scenes[sc.name] = {
      blocks: sc.blocks.length, grid: [sim.NX, sim.NY, sim.NZ], steps: sim.steps, converged: !!sim.converged,
      changes: sim.history.reduce((a, b) => a + b, 0), premerged: sim.premerged ?? 0,
      phases: sim.phases.filter((P, p) => p && P.alive).length, msSim: Math.round(tSim), ms, bbox: sc.bbox, corners,
    };
    console.log(`${set} ${sc.name} ${regName} n${n}: ${sc.blocks.length} blocks, grid ${sim.NX}x${sim.NY}x${sim.NZ}, ${sim.steps} steps, sim ${Math.round(tSim)} ms, total ${ms} ms, ${corners.length} surface corners`);
    writeFileSync(outPath, JSON.stringify(res));
  }
}
