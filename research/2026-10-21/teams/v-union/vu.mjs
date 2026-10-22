// Verifier v-union toolkit (round 2). Reads lib/mbo.mjs and teams/phys/foam2d.mjs
// unchanged (imports only). Everything written goes to teams/v-union/.
//
//  - plan(rows, dims): ASCII plan -> blocks. rows[0] is the LOWEST row (y = 0 in
//    2D, z = 0 for 3D flat configs in the x-z plane at y = 0).
//  - xList(blocks, {g}): every lattice edge whose 4 surrounding blocks form an X
//    (one diagonal pair of material m1, the other of m2 != m1). Per X: the four
//    blocks, their phases/cluster sizes, and three verdicts:
//      rule4    local/rule4.mjs (copied logic): air-X -> solid pair; else strictly
//               smaller count in a 4x4-across x 3-along window; tie none
//      tension  prior's per-edge rule: pair whose central film is cheaper
//               (same material 0, air-air 0, solid-air 1, different solids g)
//      size     phys's pressure rule read by cluster size (air pressure 0): the
//               pair whose BOTH clusters are smaller than both of the other's;
//               'mixed' when the sizes interleave, 'tie' when equal
//  - runEngine(blocks, opts, {anneal}): mbo time loop (copy of run()) with
//    per-step merge tracking; annealed noise = jitter re-drawn every step
//    (prior's scheme: seed = seed0*7919 + t) for anneal.steps, then a jitter-0
//    quench to convergence.
//  - outcome(sim, xs): per X, whether each diagonal pair ended in one root
//    phase, at which step, and whether that root is geometrically one piece.
//  - runFoam(blocks2D, {g}): phys's exact 2D solver; returns its X decisions.
import { setup, step, finish, gaussKernel, DEFAULTS, clusters } from '../../lib/mbo.mjs';

export const A = 6, B = 7, C = 1, D = 4;
const MAT = { A, B, C, D };

export function plan(rows, dims = 2, layer = 0) {
  const out = [];
  rows.forEach((row, r) => [...row].forEach((ch, x) => {
    const m = MAT[ch];
    if (!m) return;
    out.push(dims === 2 ? [x, r, 0, m] : [x, layer, r, m]);
  }));
  return out;
}
/** blocks from a map of 'x,y' -> mat (2D) */
export function fromCells(cells, dims = 2) {
  return [...cells].map(([k, m]) => { const [x, y] = k.split(',').map(Number); return dims === 2 ? [x, y, 0, m] : [x, 0, y, m]; });
}
export const swapAB = (blocks) => blocks.map(([x, y, z, m]) => [x, y, z, m === A ? B : m === B ? A : m]);

const key3 = (x, y, z) => `${x},${y},${z}`;

export function xList(blocks, { g = 1 } = {}) {
  const at = new Map(blocks.map((b, i) => [key3(b[0], b[1], b[2]), i]));
  const get = (x, y, z) => { const i = at.get(key3(x, y, z)); return i === undefined ? 0 : blocks[i][3]; };
  const idx = (x, y, z) => at.get(key3(x, y, z));
  const dims = blocks.every((b) => b[2] === 0) ? 2 : 3;
  const { phases, phaseOfBlock } = clusters(blocks, dims);
  const lo = [0, 1, 2].map((t) => Math.min(...blocks.map((b) => b[t])) - 1), hi = [0, 1, 2].map((t) => Math.max(...blocks.map((b) => b[t])) + 1);
  const xs = [];
  const tens = (m1, m2) => (m1 === m2 ? 0 : (!m1 || !m2) ? 1 : g);
  for (const axis of [0, 1, 2]) {
    const [u, v] = [0, 1, 2].filter((t) => t !== axis);
    for (let a = lo[axis]; a <= hi[axis]; a++) for (let cu = lo[u] + 1; cu <= hi[u]; cu++) for (let cv = lo[v] + 1; cv <= hi[v]; cv++) {
      const pos = (du, dv, da = 0) => { const p = [0, 0, 0]; p[axis] = a + da; p[u] = cu + du; p[v] = cv + dv; return p; };
      const P = (du, dv) => get(...pos(du, dv));
      const q00 = P(-1, -1), q11 = P(0, 0), q10 = P(0, -1), q01 = P(-1, 0);
      if (!(q00 === q11 && q10 === q01 && q00 !== q10)) continue;
      // the four blocks' phases (0 = air)
      const ph = (du, dv) => { const i = idx(...pos(du, dv)); return i === undefined ? 0 : phaseOfBlock[i]; };
      const pairs = [
        { mat: q00, ph: [ph(-1, -1), ph(0, 0)], pos: [pos(-1, -1), pos(0, 0)] },
        { mat: q10, ph: [ph(0, -1), ph(-1, 0)], pos: [pos(0, -1), pos(-1, 0)] },
      ];
      for (const pr of pairs) pr.sizes = pr.ph.map((p) => (p ? phases[p].blocks : 0));
      // rule4 (copied from teams/local/rule4.mjs)
      let r4;
      let n1 = 0, n2 = 0;
      const m1 = q00 || q10, m2 = q00 ? q10 : q00;
      if (m2 === 0) r4 = m1;
      else {
        for (let da = -1; da <= 1; da++) for (let du = -2; du < 2; du++) for (let dv = -2; dv < 2; dv++) {
          const m = get(...pos(du, dv, da));
          if (m === q00) n1++; else if (m === q10) n2++;
        }
        r4 = n1 < n2 ? q00 : n2 < n1 ? q10 : 0;
      }
      // both diagonal pairs of such an X are same-material (or air) pairs, so the
      // central film costs 0 either way: a tension tie by construction.
      const tension = 'tie';
      // size rule: higher pressure = smaller cluster; air = pressure 0 (never connects against a solid)
      let size;
      const [s0, s1] = [pairs[0].sizes, pairs[1].sizes];
      if (pairs[0].mat === 0) size = pairs[1].mat;
      else if (pairs[1].mat === 0) size = pairs[0].mat;
      else if (Math.max(...s0) < Math.min(...s1)) size = pairs[0].mat;
      else if (Math.max(...s1) < Math.min(...s0)) size = pairs[1].mat;
      else if (s0[0] + s0[1] === s1[0] + s1[1] && Math.min(...s0) === Math.min(...s1)) size = 'tie';
      else size = 'mixed';
      xs.push({ axis, a, cu, cv, at: pos(0, 0).map((t, i) => (i === axis ? a + 0.5 : t)), pairs: pairs.map((p) => ({ mat: p.mat, ph: p.ph, sizes: p.sizes })), rule4: r4, n: [n1, n2], tension, size });
    }
  }
  return { xs, phases: phases.map((p) => ({ mat: p.mat, blocks: p.blocks })), dims };
}

// ------------------------------------------------------------------ engine
const findRoot = (sim, p) => { while (sim.root[p] !== p) p = sim.root[p]; return p; };

export function runEngine(blocks, opts = {}, { anneal = null, quenchSteps = 400, xs = null, log = false } = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (opts.dims === 2 && opts.n === undefined) o.n = 32;
  const sim = setup(blocks, o);
  sim.opts = o;
  const ker = gaussKernel(o.s ?? 0.2 * o.n);
  sim.history = []; sim.mergeLog = [];
  const t0 = performance.now();
  const loop = (maxSteps, annealed, seed0, tOff) => {
    let quiet = 0;
    for (let t = 1; t <= maxSteps; t++) {
      if (annealed) o.seed = seed0 * 7919 + t;
      const before = sim.phases.map((_, p) => findRoot(sim, p));
      const r = step(sim, o, ker);
      sim.history.push(r.changes);
      if (r.merges) {
        const after = sim.phases.map((_, p) => findRoot(sim, p));
        const ev = [];
        for (let p = 1; p < after.length; p++) if (after[p] !== before[p]) ev.push([p, after[p]]);
        sim.mergeLog.push({ t: t + tOff, ev });
        if (log) console.log(`  t ${t + tOff} merges`, JSON.stringify(ev));
      }
      quiet = r.changes <= o.stopTol && !r.merges ? quiet + 1 : 0;
      sim.steps = t + tOff;
      if (!annealed && quiet >= o.stopAfter) { sim.converged = true; break; }
    }
  };
  if (anneal) {
    const seed0 = o.seed, j0 = o.jitter;
    o.jitter = anneal.amp;
    const m0 = o.merge;
    if (anneal.noMerge) o.merge = false;
    loop(anneal.steps, true, seed0, 0);
    o.merge = m0;
    o.jitter = 0; o.seed = seed0;
    sim.converged = false;
    loop(quenchSteps, false, seed0, anneal.steps);
    o.jitter = j0;
  } else loop(o.maxSteps, false, o.seed, 0);
  sim.ms = Math.round(performance.now() - t0);
  sim.lambdaRun = sim.phases.map((P) => P.lambda ?? 0);
  return sim;
}

/** first step at which phases p and q share a root (from the merge log), or null */
function mergeStep(sim, p, q) {
  if (!p || !q) return null;
  if (p === q) return 0;
  // replay the merge log with a union-find
  const par = sim.phases.map((_, i) => i);
  const f = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  for (const { t, ev } of sim.mergeLog) {
    for (const [a, r] of ev) par[f(a)] = f(r);
    if (f(p) === f(q)) return t;
  }
  return null;
}

export function components(sim, p) {
  const { NX, NY, NZ, N, label } = sim;
  const seen = new Uint8Array(N); const sizes = []; const stack = new Int32Array(N);
  for (let c0 = 0; c0 < N; c0++) {
    if (label[c0] !== p || seen[c0]) continue;
    let top = 0, size = 0; stack[top++] = c0; seen[c0] = 1;
    while (top) {
      const c = stack[--top]; size++;
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      const nb = [];
      if (i > 0) nb.push(c - 1); if (i < NX - 1) nb.push(c + 1);
      if (j > 0) nb.push(c - NX); if (j < NY - 1) nb.push(c + NX);
      if (NZ > 1) { if (k > 0) nb.push(c - NX * NY); if (k < NZ - 1) nb.push(c + NX * NY); }
      for (const q of nb) if (!seen[q] && label[q] === p) { seen[q] = 1; stack[top++] = q; }
    }
    sizes.push(size);
  }
  return sizes.sort((x, y) => y - x);
}

/** Per X: which diagonal pair ended united (same root), when, and whether the
 *  root phase is one geometric piece at the end ('pieces'). verdict: the
 *  material whose pair united (0 = air pair i.e. the solid pair did NOT),
 *  'both', or 'none'. For air-X (one pair air) the verdict is the solid
 *  material or 'none'. */
export function outcome(sim, xs) {
  const cell = sim.n ** (sim.NZ > 1 ? 3 : 2);
  return xs.map((x) => {
    const res = x.pairs.map((pr) => {
      if (pr.mat === 0) return { mat: 0, united: null };
      const [p, q] = pr.ph;
      const t = mergeStep(sim, p, q);
      const r = findRoot(sim, p);
      const pieces = t !== null ? components(sim, r).filter((s) => s > 0.05 * cell).length : null;
      return { mat: pr.mat, united: t !== null, step: t, pieces };
    });
    const u = res.filter((r) => r.mat && r.united);
    const verdict = u.length === 2 ? 'both' : u.length === 1 ? u[0].mat : 'none';
    // geometric verdict: united AND the root phase is one piece at the end
    const ug = res.filter((r) => r.mat && r.united && r.pieces === 1);
    const geo = ug.length === 2 ? 'both' : ug.length === 1 ? ug[0].mat : 'none';
    // first: the pair whose members merged first (the X decision); later merges of
    // the other pair (e.g. around the ends in FREE) are reported in 'verdict'
    const st = res.filter((r) => r.mat && r.united).map((r) => [r.mat, r.step]);
    let first = 'none';
    if (st.length === 1) first = st[0][0];
    else if (st.length === 2) first = st[0][1] < st[1][1] ? st[0][0] : st[1][1] < st[0][1] ? st[1][0] : 'both';
    return { at: x.at, rule4: x.rule4, size: x.size, verdict, geo, first, res };
  });
}

/** Material connectivity: number of face-connected components of each
 *  material's sub-cells (any phase), ignoring specks < 5% of a block. */
export function matComponents(sim) {
  const { NX, NY, NZ, N, label, phases } = sim;
  const cell = sim.n ** (NZ > 1 ? 3 : 2);
  const mat = new Uint8Array(N);
  for (let c = 0; c < N; c++) mat[c] = label[c] ? phases[label[c]].mat : 0;
  const seen = new Uint8Array(N); const stack = new Int32Array(N); const out = {};
  for (let c0 = 0; c0 < N; c0++) {
    const m = mat[c0]; if (!m || seen[c0]) continue;
    let top = 0, size = 0; stack[top++] = c0; seen[c0] = 1;
    while (top) {
      const c = stack[--top]; size++;
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      const nb = [];
      if (i > 0) nb.push(c - 1); if (i < NX - 1) nb.push(c + 1);
      if (j > 0) nb.push(c - NX); if (j < NY - 1) nb.push(c + NX);
      if (NZ > 1) { if (k > 0) nb.push(c - NX * NY); if (k < NZ - 1) nb.push(c + NX * NY); }
      for (const q of nb) if (!seen[q] && mat[q] === m) { seen[q] = 1; stack[top++] = q; }
    }
    if (size > 0.05 * cell) (out[m] ??= []).push(+(size / cell).toFixed(2));
  }
  return out;
}

export function phaseSummary(sim) {
  const cell = sim.n ** (sim.NZ > 1 ? 3 : 2);
  const out = [];
  for (let p = 1; p < sim.phases.length; p++) {
    const P = sim.phases[p]; if (!P.alive) continue;
    out.push({ p, mat: P.mat, blocks: P.blocks, lam: +(sim.lambdaRun?.[p] ?? P.lambda).toFixed(4), pieces: components(sim, p).filter((s) => s > 0.05 * cell).length });
  }
  return out;
}

/** face-adjacent sub-cell pairs between the root phases of p and q (film area
 *  in sub-cell faces) */
export function contact(sim, p, q) {
  const { NX, NY, NZ, label } = sim;
  p = findRoot(sim, p); q = findRoot(sim, q);
  let c = 0;
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = label[(k * NY + j) * NX + i];
    if (a !== p && a !== q) continue;
    const nb = [];
    if (i + 1 < NX) nb.push(label[(k * NY + j) * NX + i + 1]);
    if (j + 1 < NY) nb.push(label[(k * NY + j + 1) * NX + i]);
    if (NZ > 1 && k + 1 < NZ) nb.push(label[((k + 1) * NY + j) * NX + i]);
    for (const b of nb) if ((a === p && b === q) || (a === q && b === p)) c++;
  }
  return c;
}
export const rootOf = findRoot;
export { finish };
