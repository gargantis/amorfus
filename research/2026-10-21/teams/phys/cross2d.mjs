// Cross-check of the MBO engine (lib/mbo.mjs, dims 2) against the
// independent 2D foam solver (foam2d.mjs), FREE regime.
//   node cross2d.mjs <case> [settings]   settings: "32:0.2:0:1,64:0.2:0.001:2" = n:s_blocks:jitter:seed
// Writes cross2d/<case>.json and cross2d/<case>-*.png (engine labels with the
// exact films overlaid in white).
import { writeFileSync, mkdirSync } from 'node:fs';
import { byName, to2D, A, B } from '../../lib/configs.mjs';
import { fromBlocks } from './foam2d.mjs';
import { simulateKeep, junctions2D, anglesAt, labelImage, components, interface2D } from './labtools.mjs';
import { drawLabels, savePng } from './labimg.mjs';
import { doubleBubble } from './exact.mjs';

const CASES = {
  'pair-diff': { blocks: to2D(byName('pair-diff').blocks), exact: [1, 1] },
  'row-ABB': { blocks: [[0, 0, 0, A], [1, 0, 0, B], [2, 0, 0, B]], exact: [1, 2] },
  'line3-ABA': { blocks: to2D(byName('line3-ABA').blocks) },
  'sq2-checker': { blocks: to2D(byName('sq2-checker').blocks), options: true },
  'sq2-ABCD': { blocks: to2D(byName('sq2-ABCD').blocks), options: true, noSplit: true },
  'L3-ABC': { blocks: to2D(byName('L3-ABC').blocks), noSplit: true },
  'diag-edge': { blocks: to2D(byName('diag-edge').blocks) },
  'diag-edge-diff': { blocks: to2D(byName('diag-edge-diff').blocks) },
  'slab-line': { blocks: to2D(byName('slab-line').blocks), h: 0.06, T: 600, options: true },
  'L3-ABA': { blocks: [[0, 0, 0, B], [1, 0, 0, A], [0, 1, 0, A]] },
  // unequal checkerboard: the diagonal pair of single blocks (higher pressure) vs two 2-block clusters
  'checker-smallA': { blocks: [[0, 0, 0, A], [1, 0, 0, B], [2, 0, 0, B], [0, 1, 0, B], [0, 2, 0, B], [1, 1, 0, A]], options: true },
  'checker-smallB': { blocks: [[0, 0, 0, B], [1, 0, 0, A], [2, 0, 0, A], [0, 1, 0, A], [0, 2, 0, A], [1, 1, 0, B]], options: true },
};
const name = process.argv[2];
const C = CASES[name];
const settings = (process.argv[3] ?? '32:0.2:0:1,32:0.2:0.001:1,32:0.2:0.001:2,32:0.2:0.001:3,64:0.2:0:1,64:0.2:0.001:1,64:0.1:0:1')
  .split(',').map((s) => { const [n, sb, jit, seed] = s.split(':').map(Number); return { n, sb, jit, seed }; });
const dir = new URL('./cross2d/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const r5 = (v) => (typeof v === 'number' ? +v.toPrecision(6) : v);

// ---------- exact solver runs ----------
function solverRun(choose, label, extra = {}) {
  const F = fromBlocks(C.blocks, { h: C.h ?? 0.03 });
  const r = F.run({ maxTime: C.T ?? 120, choose, holdTime: 0.05, ...extra });
  const s = F.summary();
  return {
    label, converged: !!r.converged, t: r.t, steps: r.steps, contact: r.contact ?? null, energy: s.energy,
    bubbles: s.bubbles.map((b) => ({ mat: b.mat, area: b.area, target: b.target, pressure: b.pressure })),
    junctions: s.junctions.map((j) => ({ at: j.at, degree: j.degree, sectors: j.sectors.map((x) => ({ mat: x.mat, deg: x.deg })) })),
    films: s.films.map((f) => ({ mats: f.mats, length: f.length, r: f.r, rms: f.rms })),
    events: F.events.filter((e) => e.kind !== 'merge' || true).map((e) => ({ t: e.t, kind: e.kind, mats: e.mats, options: e.options, decided: e.decided })),
    adjacency: [...new Set(s.films.map((f) => f.mats.slice().sort((a, b) => a - b).join('|')))].sort(),
    signature: s.bubbles.map((b) => `${b.mat}:${Math.round(b.target)}`).sort().join(' '),
    polylines: F.polylines().map((p) => ({ mats: [F.mat(p.L), F.mat(p.R)], L: p.L, R: p.R, pts: p.pts })),
  };
}
const solver = [];
solver.push(solverRun(null, 'rule (pressure-favoured split; ties -> first option)'));
if (C.options) {
  // force each of the two options at every 4-fold junction (by materials made adjacent)
  const first = solver[0].events.find((e) => e.kind === 'decide');
  if (first) for (const o of first.options) {
    const key = o.mats.slice().sort().join(',');
    solver.push(solverRun((opts) => { const k = opts.findIndex((p) => p.mats.slice().sort().join(',') === key); return k >= 0 ? k : null; }, `forced: ${key} adjacent`));
  }
}
if (C.noSplit) solver.push(solverRun(() => null, 'no split (4-fold junction kept)', { holdTime: 1e9, tieTol: 1e9 }));
for (const s of solver) console.log(`solver [${s.label}] E ${s.energy.toFixed(5)} conv ${s.converged} t ${s.t.toFixed(1)} sig ${s.signature} adj ${s.adjacency.join(',')} contact ${JSON.stringify(s.contact)}`);

// ---------- engine runs ----------
function engineEnergy(sim, label = sim.label) {
  // perimeter of each phase and of the solid union: 0.5-contour of the
  // indicator blurred with std 0.7 px (marching squares), in blocks
  const { NX, NY, n } = sim;
  const per = (pred) => {
    const u = new Float64Array(NX * NY);
    for (let c = 0; c < NX * NY; c++) u[c] = pred(label[c]) ? 1 : 0;
    const s = 0.7, R = 3, k = []; let ks = 0;
    for (let i = -R; i <= R; i++) { k.push(Math.exp(-(i * i) / (2 * s * s))); ks += k[k.length - 1]; }
    const tmp = new Float64Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let a = 0; for (let t = -R; t <= R; t++) { const ii = i + t; if (ii >= 0 && ii < NX) a += k[t + R] * u[j * NX + ii]; } tmp[j * NX + i] = a / ks; }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let a = 0; for (let t = -R; t <= R; t++) { const jj = j + t; if (jj >= 0 && jj < NY) a += k[t + R] * tmp[jj * NX + i]; } u[j * NX + i] = a / ks; }
    let L = 0;
    for (let j = 0; j + 1 < NY; j++) for (let i = 0; i + 1 < NX; i++) {
      const v = [u[j * NX + i], u[j * NX + i + 1], u[(j + 1) * NX + i + 1], u[(j + 1) * NX + i]];
      const P = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const cr = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e] - 0.5, b = v[(e + 1) % 4] - 0.5;
        if ((a < 0) !== (b < 0)) { const t = a / (a - b); cr.push([P[e][0] + t * (P[(e + 1) % 4][0] - P[e][0]), P[e][1] + t * (P[(e + 1) % 4][1] - P[e][1])]); }
      }
      if (cr.length === 2) L += Math.hypot(cr[0][0] - cr[1][0], cr[0][1] - cr[1][1]);
      else if (cr.length === 4) L += Math.hypot(cr[0][0] - cr[1][0], cr[0][1] - cr[1][1]) + Math.hypot(cr[2][0] - cr[3][0], cr[2][1] - cr[3][1]);
    }
    return L / n;
  };
  const alive = [...new Set(label)].filter((l) => l !== 0);
  let sum = 0;
  for (const p of alive) sum += per((l) => l === p);
  const union = per((l) => l !== 0);
  return 0.5 * (sum + union);
}

/** The exact solution rasterised onto the engine grid (pixel centres):
 *  region of a point = side of the first film crossed by a ray toward +x. */
function rasterize(sim, polys) {
  const { NX, NY, n, ox, oy } = sim;
  const out = new Int32Array(NX * NY);
  const segs = [];
  for (const p of polys) for (let i = 0; i + 1 < p.pts.length; i++) segs.push([p.pts[i], p.pts[i + 1], p.L, p.R]);
  for (let j = 0; j < NY; j++) {
    const y = oy + (j + 0.5) / n;
    const hits = [];
    for (const [a, b, L, R] of segs) {
      if ((a[1] <= y) === (b[1] <= y)) continue;
      const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
      hits.push([x, b[1] > a[1] ? L : R]);
    }
    hits.sort((p, q) => p[0] - q[0]);
    let h = 0;
    for (let i = 0; i < NX; i++) {
      const x = ox + (i + 0.5) / n;
      while (h < hits.length && hits[h][0] < x) h++;
      out[j * NX + i] = h < hits.length ? hits[h][1] : 0;
    }
  }
  return out;
}

function distToPolys(pts, polys) {
  let mean = 0, mx = 0;
  for (const p of pts) {
    let best = Infinity;
    for (const pl of polys) for (let i = 0; i + 1 < pl.length; i++) {
      const a = pl[i], b = pl[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
    mean += best; mx = Math.max(mx, best);
  }
  return { mean: mean / pts.length, max: mx, count: pts.length };
}

const engine = [];
for (const st of settings) {
  const sim = simulateKeep(C.blocks, { dims: 2, n: st.n, s: st.sb * st.n, maxSteps: 800, jitter: st.jit, seed: st.seed });
  const alive = sim.phases.map((P, p) => (p && P.alive ? p : 0)).filter(Boolean);
  const img = labelImage(sim);
  const phases = alive.map((p) => ({ p, mat: sim.phases[p].mat, blocks: sim.phases[p].blocks, comps: components(sim, p).length, pressure: sim.lambdaRun[p] * Math.sqrt(2 * Math.PI) / st.sb }));
  const adj = new Set();
  for (let i = 0; i < alive.length; i++) {
    if (interface2D(img, alive[i], 0).length) adj.add([sim.phases[alive[i]].mat, 0].sort((a, b) => a - b).join('|'));
    for (let j = i + 1; j < alive.length; j++) if (interface2D(img, alive[i], alive[j]).length) adj.add([sim.phases[alive[i]].mat, sim.phases[alive[j]].mat].sort((a, b) => a - b).join('|'));
  }
  const J = junctions2D(img);
  const angles = st.n >= 64 ? J.filter((j) => j.labs.length === 3).map((j) => ({ at: [j.x, j.y], ...anglesAt(img, j, { rOut: 0.35 }) })) : [];
  const signature = phases.map((p) => `${p.mat}:${p.blocks}`).sort().join(' ');
  const match = solver.find((s) => s.signature === signature && s.label !== 'no split (4-fold junction kept)' ) ?? null;
  // distances of the engine interfaces to the matching exact films, per material pair
  let dist = null;
  if (match) {
    const pts = [];
    const polys = match.polylines.map((p) => p.pts);
    for (let i = 0; i < alive.length; i++) {
      pts.push(...interface2D(img, alive[i], 0));
      for (let j = i + 1; j < alive.length; j++) pts.push(...interface2D(img, alive[i], alive[j]));
    }
    dist = distToPolys(pts, polys);
  }
  const E = engineEnergy(sim);
  const ipts = [];
  for (let i = 0; i < alive.length; i++) { ipts.push(...interface2D(img, alive[i], 0)); for (let j = i + 1; j < alive.length; j++) ipts.push(...interface2D(img, alive[i], alive[j])); }
  const distAll = Object.fromEntries(solver.map((s) => [s.label, distToPolys(ipts, s.polylines.map((p) => p.pts))]));
  const Eraster = match ? engineEnergy(sim, rasterize(sim, match.polylines)) : null;
  const rec = {
    ...st, steps: sim.steps, converged: !!sim.converged, phases, signature, adjacency: [...adj].sort(),
    triple: J.filter((j) => j.labs.length === 3).length, quad: J.filter((j) => j.fourCorners > 0).length,
    energy: E, energyExactRaster: Eraster, distAll, matchedSolver: match?.label ?? null, energyExcessRel: match ? E / Eraster - 1 : null, dist, angles,
    pressureExact: match ? match.bubbles.map((b) => ({ mat: b.mat, target: b.target, p: b.pressure })) : null,
  };
  engine.push(rec);
  console.log(`  dist to each solver outcome: ${Object.entries(distAll).map(([k, d]) => `[${k.slice(0, 20)}] ${d.mean.toFixed(4)}/${d.max.toFixed(4)}`).join(' ')}`);
  console.log(`engine n ${st.n} s ${st.sb} jit ${st.jit} seed ${st.seed}: ${sim.steps} steps${sim.converged ? '' : ' (nc)'} sig ${signature}${phases.some((p) => p.comps > 1) ? ' [DISCONNECTED PHASE]' : ''} adj ${rec.adjacency.join(',')} quad ${rec.quad} E ${E.toFixed(4)}${match ? ` vs exact-rasterised ${Eraster.toFixed(4)} (${(100 * (E / Eraster - 1)).toFixed(2)}%) [exact ${match.energy.toFixed(4)}] p ${phases.map((p) => p.pressure.toFixed(3)).join(',')} vs ${match.bubbles.map((b) => b.pressure.toFixed(3)).join(',')} dist mean ${dist.mean.toFixed(4)} max ${dist.max.toFixed(4)}` : ' (no matching solver outcome)'}`);
  // image: engine labels + exact films (white) of the matching outcome (or the rule run)
  const ov = (match ?? solver[0]).polylines.map((p) => ({ pts: p.pts, color: [255, 255, 255] }));
  const scale = Math.max(1, Math.round(320 / Math.max(img.w, img.h)));
  savePng(`${dir}${name}-n${st.n}-s${st.sb}-j${st.jit}-seed${st.seed}.png`, drawLabels(sim, img, { scale, overlays: ov }));
}

// exact double bubble reference where it exists
const ref = C.exact ? doubleBubble(C.exact[0], C.exact[1], 2) : null;
writeFileSync(`${dir}${name}.json`, JSON.stringify({ case: name, solver: solver.map((s) => ({ ...s, polylines: undefined })), solverPolylines: solver.map((s) => s.polylines), engine, exactDoubleBubble: ref }, (k, v) => r5(v), 1));
