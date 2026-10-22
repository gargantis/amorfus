// Bubble physics for block configurations (research code, scratchpad).
// TEAM 'table' COPY of lib/mbo.mjs: the only change is blur3's boundary
// (clamp-to-edge instead of zero padding) and an optional `bbox` option
// fixing the grid's block bounds; see REPORT.md, method.
//
// Model: every block is a bubble. Face-adjacent blocks of one material start
// as one bubble (a cluster); blocks of different materials keep a film
// between them. Air is the reservoir (open atmosphere, pressure 0).
//
// Dynamics: multiphase threshold dynamics (MBO) with surface tensions
// (Esedoglu & Otto 2015). Each step blurs every phase's indicator with a
// Gaussian (u_i) and reassigns every cell to the phase with least
// ψ_i − λ_i, where ψ_i = Σ_j σ_ij u_j. The shift λ_i is the bubble's
// pressure: it is solved per step so that each bubble keeps its volume
// (quantile solve, Jacobi sweeps). Tensions: σ(solid, air) = 1,
// σ(different materials) = g, σ(same material, separate clusters) = eps.
// Same-material phases that come to touch are merged ("unite").
//
// Units: blocks. The grid has n sub-cells per block; cell (i,j,k) spans
// [o + i/n, o + (i+1)/n] on each axis. Index = (k*NY + j)*NX + i.
//
// Anchors (optional, to keep shapes near their blocks):
//   { kind: 'cage', r }      phase may only occupy its blocks dilated by r
//                            (box metric) and always keeps them eroded by r
//   { kind: 'fidelity', k }  cost k for a cell leaving its original phase
// Finite-time relaxation = maxSteps without reaching equilibrium.

export const DEFAULTS = {
  dims: 3, n: 16, margin: 1.0, s: null, g: 1, eps: 0.05,
  volume: true, anchor: null, maxSteps: 150, stopAfter: 3, stopTol: 0,
  merge: true, renderS: null, sweeps: 6, log: false, jitter: 0, seed: 1,
};

// Seeded per-(cell, phase) noise in [-1, 1): breaks exact symmetry ties the
// way fluctuations would. 0 (default) keeps runs exactly deterministic.
const noise = (c, p, seed) => {
  let h = Math.imul(c ^ Math.imul(p + 1, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b), 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 2147483648 - 1;
};

const BIG = 9; // "not a candidate" value for interpolated phase costs

export function gaussKernel(s) {
  const R = Math.max(1, Math.ceil(3 * s));
  const k = new Float64Array(2 * R + 1);
  let sum = 0;
  for (let i = -R; i <= R; i++) { k[i + R] = Math.exp(-(i * i) / (2 * s * s)); sum += k[i + R]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return { k, R };
}

/** Separable blur of a (w,h,d) x-fastest array, in place. */
export function blur3(arr, w, h, d, ker) {
  const { k, R } = ker;
  const L = Math.max(w, h, d);
  const line = new Float64Array(L), tmp = new Float64Array(L);
  const axes = d > 1 ? [0, 1, 2] : [0, 1];
  for (const axis of axes) {
    const len = axis === 0 ? w : axis === 1 ? h : d;
    const stride = axis === 0 ? 1 : axis === 1 ? w : w * h;
    const nA = axis === 0 ? h : w, nB = axis === 2 ? h : d;
    for (let b = 0; b < nB; b++) {
      for (let a = 0; a < nA; a++) {
        const s0 = axis === 0 ? (b * h + a) * w : axis === 1 ? b * w * h + a : b * w + a;
        let any = false;
        for (let i = 0; i < len; i++) { const v = arr[s0 + i * stride]; line[i] = v; if (v !== 0) any = true; }
        if (!any) continue;
        for (let i = 0; i < len; i++) {
          let acc = 0;
          // team 'table' change: clamp-to-edge (Neumann) boundary instead of
          // zero padding, so a block touching the grid edge continues past it
          // and the cut is not a surface.
          for (let j = i - R; j <= i + R; j++) acc += k[j - i + R] * line[j < 0 ? 0 : j >= len ? len - 1 : j];
          tmp[i] = acc;
        }
        for (let i = 0; i < len; i++) arr[s0 + i * stride] = tmp[i];
      }
    }
  }
}

/** Separable box max (dilate) or min (erode) of a Uint8 mask by r cells. */
function morph(mask, w, h, d, r, dilate) {
  if (r <= 0) return mask.slice();
  let cur = mask.slice();
  const axes = d > 1 ? [0, 1, 2] : [0, 1];
  for (const axis of axes) {
    const len = axis === 0 ? w : axis === 1 ? h : d;
    const stride = axis === 0 ? 1 : axis === 1 ? w : w * h;
    const nA = axis === 0 ? h : w, nB = axis === 2 ? h : d;
    const out = new Uint8Array(cur.length);
    for (let b = 0; b < nB; b++) for (let a = 0; a < nA; a++) {
      const s0 = axis === 0 ? (b * h + a) * w : axis === 1 ? b * w * h + a : b * w + a;
      for (let i = 0; i < len; i++) {
        let v = dilate ? 0 : 1;
        for (let j = Math.max(0, i - r); j <= Math.min(len - 1, i + r); j++) {
          const m = cur[s0 + j * stride];
          if (dilate ? m : !m) { v = dilate ? 1 : 0; break; }
        }
        // erosion treats outside the grid as "not in mask"
        if (!dilate && (i - r < 0 || i + r > len - 1)) v = 0;
        out[s0 + i * stride] = v;
      }
    }
    cur = out;
  }
  return cur;
}

/** Face-connected same-material clusters of a block list → phases. */
export function clusters(blocks, dims = 3) {
  const key = (x, y, z) => `${x},${y},${dims === 3 ? z : 0}`;
  const at = new Map();
  blocks.forEach((b, i) => at.set(key(b[0], b[1], b[2]), i));
  const parent = blocks.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const dirs = dims === 3 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0]];
  blocks.forEach((b, i) => {
    for (const [dx, dy, dz] of dirs) {
      const j = at.get(key(b[0] + dx, b[1] + dy, b[2] + dz));
      if (j !== undefined && blocks[j][3] === b[3]) parent[find(j)] = find(i);
    }
  });
  const rootPhase = new Map();
  const phaseOfBlock = new Int32Array(blocks.length);
  const phases = [{ mat: 0 }];
  blocks.forEach((b, i) => {
    const r = find(i);
    if (!rootPhase.has(r)) rootPhase.set(r, phases.push({ mat: b[3], blocks: 0 }) - 1);
    const p = rootPhase.get(r);
    phases[p].blocks++;
    phaseOfBlock[i] = p;
  });
  return { phases, phaseOfBlock };
}

export function setup(blocks, o) {
  const { dims, n } = o;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const [x, y, z] of blocks) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
  }
  if (o.bbox) { // team 'table' change: optional fixed block bounds [x0,y0,z0,x1,y1,z1]
    x0 = Math.min(x0, o.bbox[0]); y0 = Math.min(y0, o.bbox[1]); z0 = Math.min(z0, o.bbox[2]);
    x1 = Math.max(x1, o.bbox[3]); y1 = Math.max(y1, o.bbox[4]); z1 = Math.max(z1, o.bbox[5]);
  }
  if (dims === 2) { z0 = 0; z1 = 0; }
  const mc = Math.ceil(o.margin * n);
  const NX = (x1 - x0 + 1) * n + 2 * mc, NY = (y1 - y0 + 1) * n + 2 * mc;
  const NZ = dims === 3 ? (z1 - z0 + 1) * n + 2 * mc : 1;
  const ox = x0 - mc / n, oy = y0 - mc / n, oz = dims === 3 ? z0 - mc / n : 0;
  const N = NX * NY * NZ;
  const { phases, phaseOfBlock } = clusters(blocks, dims);
  const label = new Uint8Array(N);
  if (phases.length > 250) throw new Error('too many clusters for Uint8 labels');
  const cellVol = dims === 3 ? n * n * n : n * n;
  blocks.forEach((b, bi) => {
    const p = phaseOfBlock[bi];
    const i0 = (b[0] - x0) * n + mc, j0 = (b[1] - y0) * n + mc, k0 = dims === 3 ? (b[2] - z0) * n + mc : 0;
    const kn = dims === 3 ? n : 1;
    for (let k = k0; k < k0 + kn; k++) for (let j = j0; j < j0 + n; j++) for (let i = i0; i < i0 + n; i++) {
      label[(k * NY + j) * NX + i] = p;
    }
  });
  for (let p = 1; p < phases.length; p++) {
    phases[p].target = phases[p].blocks * cellVol;
    phases[p].lambda = 0;
    phases[p].alive = true;
  }
  phases[0].alive = true;
  const sim = { dims, n, NX, NY, NZ, N, ox, oy, oz, cellVol, label, phases, orig: label.slice(),
    root: phases.map((_, i) => i), blocks };
  // anchors
  if (o.anchor?.kind === 'cage') {
    const rc = Math.round(o.anchor.r * n);
    for (let p = 1; p < phases.length; p++) {
      const m = new Uint8Array(N);
      for (let c = 0; c < N; c++) m[c] = label[c] === p ? 1 : 0;
      phases[p].allowed = morph(m, NX, NY, NZ, rc, true);
      phases[p].forced = morph(m, NX, NY, NZ, rc, false);
    }
  }
  return sim;
}

const findRoot = (sim, p) => { while (sim.root[p] !== p) p = sim.root[p]; return p; };

function phaseBox(sim, p, R) {
  const { NX, NY, NZ, label } = sim;
  let i0 = NX, j0 = NY, k0 = NZ, i1 = -1, j1 = -1, k1 = -1;
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) {
    const row = (k * NY + j) * NX;
    for (let i = 0; i < NX; i++) if (label[row + i] === p) {
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; if (k < k0) k0 = k; if (k > k1) k1 = k;
    }
  }
  if (i1 < 0) return null;
  const Rz = NZ > 1 ? R : 0;
  return [Math.max(0, i0 - R), Math.max(0, j0 - R), Math.max(0, k0 - Rz),
    Math.min(NX - 1, i1 + R), Math.min(NY - 1, j1 + R), Math.min(NZ - 1, k1 + Rz)];
}

/** Blur every live solid phase; accumulate per-material and total sums. */
function fields(sim, ker) {
  const { NX, NY, N, label, phases } = sim;
  const Sall = sim.Sall ?? (sim.Sall = new Float32Array(N));
  Sall.fill(0);
  sim.Smat = sim.Smat ?? new Map();
  for (const a of sim.Smat.values()) a.fill(0);
  for (let p = 1; p < phases.length; p++) {
    const P = phases[p];
    if (!P.alive) continue;
    const box = phaseBox(sim, p, ker.R);
    P.box = box;
    if (!box) { P.u = null; continue; }
    const [i0, j0, k0, i1, j1, k1] = box;
    const w = i1 - i0 + 1, h = j1 - j0 + 1, d = k1 - k0 + 1;
    const u = new Float32Array(w * h * d);
    for (let k = 0; k < d; k++) for (let j = 0; j < h; j++) {
      const src = ((k + k0) * NY + (j + j0)) * NX + i0, dst = (k * h + j) * w;
      for (let i = 0; i < w; i++) u[dst + i] = label[src + i] === p ? 1 : 0;
    }
    blur3(u, w, h, d, ker);
    P.u = u;
    if (!sim.Smat.has(P.mat)) sim.Smat.set(P.mat, new Float32Array(N));
    const Sm = sim.Smat.get(P.mat);
    for (let k = 0; k < d; k++) for (let j = 0; j < h; j++) {
      const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * h + j) * w;
      for (let i = 0; i < w; i++) { const v = u[b0 + i]; Sall[g0 + i] += v; Sm[g0 + i] += v; }
    }
  }
}

/** Iterate (cell, phase cost) over phase p's candidate cells. */
function forEachCandidate(sim, p, o, fid, fn) {
  const { NX, NY, phases, Sall } = sim;
  const P = phases[p];
  if (!P.u) return;
  const Sm = sim.Smat.get(P.mat);
  const [i0, j0, k0, i1, j1, k1] = P.box;
  const w = i1 - i0 + 1, h = j1 - j0 + 1, d = k1 - k0 + 1;
  const g = o.g, eps = o.eps, u = P.u;
  const allowed = P.allowed;
  for (let k = 0; k < d; k++) for (let j = 0; j < h; j++) {
    const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * h + j) * w;
    for (let i = 0; i < w; i++) {
      const ui = u[b0 + i];
      if (ui < 1e-5) continue;
      const c = g0 + i;
      if (allowed && !allowed[c]) continue;
      const sa = Sall[c], sm = Sm[c];
      let psi = (1 - sa) + g * (sa - sm) + eps * (sm - ui);
      if (fid) psi += findRoot(sim, sim.orig[c]) === p ? 0 : fid;
      if (o.jitter) psi += o.jitter * noise(c, p, o.seed);
      fn(c, psi);
    }
  }
}

function bestOf(sim, o, fid, withLambda = true) {
  const { N, phases, Sall } = sim;
  const bestVal = sim.bestVal ?? (sim.bestVal = new Float32Array(N));
  const second = sim.second ?? (sim.second = new Float32Array(N));
  const bestPh = sim.bestPh ?? (sim.bestPh = new Uint8Array(N));
  for (let c = 0; c < N; c++) {
    let v = Sall[c];
    if (fid && sim.orig[c] !== 0) v += fid;
    if (o.jitter) v += o.jitter * noise(c, 0, o.seed);
    bestVal[c] = v; bestPh[c] = 0; second[c] = 1e9;
  }
  for (let p = 1; p < phases.length; p++) {
    if (!phases[p].alive) continue;
    const lam = withLambda ? phases[p].lambda : 0;
    forEachCandidate(sim, p, o, fid, (c, psi) => {
      const v = psi - lam;
      if (v < bestVal[c]) { second[c] = bestVal[c]; bestVal[c] = v; bestPh[c] = p; } else if (v < second[c]) second[c] = v;
    });
  }
  // forced cells (cage erosion) belong to their phase whatever the cost
  for (let p = 1; p < phases.length; p++) {
    const F = phases[p].forced;
    if (!phases[p].alive || !F) continue;
    for (let c = 0; c < N; c++) if (F[c]) { bestPh[c] = p; }
  }
}

/** Wirth's selection: reorders a so that a[k] is its k-th smallest
 *  (0-based), with a[i < k] ≤ a[k] ≤ a[i > k]. */
function select(a, k) {
  let lo = 0, hi = a.length - 1;
  while (lo < hi) {
    const x = a[k];
    let i = lo, j = hi;
    do {
      while (a[i] < x) i++;
      while (x < a[j]) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    } while (i <= j);
    if (j < k) lo = i;
    if (k < i) hi = j;
  }
  return a[k];
}

/** Jacobi sweeps: λ_p = target-th smallest margin over p's candidates. */
function solveVolumes(sim, o, fid, targets) {
  const { phases } = sim;
  let buf = new Float32Array(1024);
  for (let sweep = 0; sweep < o.sweeps; sweep++) {
    bestOf(sim, o, fid);
    const { bestVal, second, bestPh } = sim;
    let worst = 0;
    const next = [];
    for (let p = 1; p < phases.length; p++) {
      const P = phases[p];
      if (!P.alive || !P.u) continue;
      let cnt = 0, forcedCnt = 0;
      const F = P.forced;
      forEachCandidate(sim, p, o, fid, (c, psi) => {
        if (F && F[c]) { forcedCnt++; return; }
        const other = bestPh[c] === p ? second[c] : bestVal[c];
        if (cnt >= buf.length) { const nb = new Float32Array(buf.length * 2); nb.set(buf); buf = nb; }
        buf[cnt++] = psi - other;
      });
      if (F) { forcedCnt = 0; for (let c = 0; c < F.length; c++) if (F[c]) forcedCnt++; }
      const need = Math.round(targets[p]) - forcedCnt;
      let lam;
      if (need <= 0) lam = -BIG;
      else if (need > cnt) lam = BIG;
      else {
        const arr = buf.subarray(0, cnt);
        const kth = select(arr, need - 1);
        let above = Infinity;
        for (let i = need; i < cnt; i++) if (arr[i] < above) above = arr[i];
        lam = need < cnt ? 0.5 * (kth + above) : kth + 1e-6;
      }
      worst = Math.max(worst, Math.abs(lam - P.lambda));
      next.push([p, lam]);
    }
    for (const [p, lam] of next) phases[p].lambda = lam;
    if (worst < 1e-5) break;
  }
}

function mergeTouching(sim) {
  const { NX, NY, NZ, label, phases } = sim;
  const par = phases.map((_, i) => i);
  const f = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  let merged = false;
  const strides = NZ > 1 ? [1, NX, NX * NY] : [1, NX];
  const N = label.length;
  for (let c = 0; c < N; c++) {
    const a = label[c];
    if (!a) continue;
    for (const st of strides) {
      const c2 = c + st;
      if (c2 >= N) continue;
      if (st === 1 && (c % NX) === NX - 1) continue;
      if (st === NX && Math.floor(c / NX) % NY === NY - 1) continue;
      const b = label[c2];
      if (b && b !== a && phases[a].mat === phases[b].mat) {
        const ra = f(a), rb = f(b);
        if (ra !== rb) { par[rb] = ra; merged = true; }
      }
    }
  }
  if (!merged) return 0;
  let count = 0;
  for (let p = 1; p < phases.length; p++) {
    const r = f(p);
    if (r === p || !phases[p].alive) continue;
    const A = phases[r], B = phases[p];
    A.lambda = (A.lambda * A.target + B.lambda * B.target) / (A.target + B.target);
    A.target += B.target; A.blocks += B.blocks;
    if (A.allowed && B.allowed) for (let c = 0; c < N; c++) { A.allowed[c] |= B.allowed[c]; A.forced[c] |= B.forced[c]; }
    B.alive = false; B.u = null;
    sim.root[p] = r;
    count++;
  }
  for (let c = 0; c < N; c++) if (label[c]) label[c] = f(label[c]);
  return count;
}

export function step(sim, o, ker) {
  const fid = o.anchor?.kind === 'fidelity' ? o.anchor.k : 0;
  fields(sim, ker);
  const targets = sim.phases.map((P) => P.target ?? 0);
  if (o.volume) solveVolumes(sim, o, fid, targets);
  bestOf(sim, o, fid, o.volume);
  const { bestPh, label } = sim;
  let changes = 0;
  for (let c = 0; c < label.length; c++) if (label[c] !== bestPh[c]) { changes++; label[c] = bestPh[c]; }
  const merges = o.merge ? mergeTouching(sim) : 0;
  return { changes, merges };
}

export function run(sim, o) {
  const s = o.s ?? 0.2 * o.n;
  const ker = gaussKernel(s);
  sim.history = [];
  let quiet = 0;
  for (let t = 1; t <= o.maxSteps; t++) {
    const r = step(sim, o, ker);
    sim.history.push(r.changes);
    if (o.log) console.log(`step ${t}: changes ${r.changes}${r.merges ? `, merged ${r.merges}` : ''}`);
    quiet = r.changes <= o.stopTol && !r.merges ? quiet + 1 : 0;
    sim.steps = t;
    if (quiet >= o.stopAfter) { sim.converged = true; break; }
  }
  return sim;
}

/** Smooth fields for rendering and measuring: blur the final labels with
 *  renderS, re-solve λ (no anchors) to the bubbles' volumes, and expose
 *  D = (air cost) − (least solid cost): D > 0 inside solid, D = 0 on the
 *  surface; each live phase's cost field `val` over its box. */
export function finish(sim, o) {
  const rs = o.renderS ?? 0.125 * o.n;
  const ker = gaussKernel(rs);
  const plain = { ...o, anchor: null };
  for (const P of sim.phases) { if (P.allowed) { P.allowedSaved = P.allowed; P.allowed = null; P.forcedSaved = P.forced; P.forced = null; } }
  fields(sim, ker);
  const counts = new Float64Array(sim.phases.length);
  for (let c = 0; c < sim.N; c++) counts[sim.label[c]]++;
  const targets = sim.phases.map((P, p) => (p === 0 ? 0 : (o.volume ? P.target : counts[p])));
  solveVolumes(sim, plain, 0, targets);
  const { N, NX, NY, phases, Sall } = sim;
  const minSolid = new Float32Array(N).fill(BIG);
  for (let p = 1; p < phases.length; p++) {
    const P = phases[p];
    if (!P.alive || !P.u) continue;
    const [i0, j0, k0, i1, j1, k1] = P.box;
    const w = i1 - i0 + 1, h = j1 - j0 + 1, d = k1 - k0 + 1;
    const val = new Float32Array(w * h * d).fill(BIG);
    forEachCandidate(sim, p, plain, 0, (c, psi) => {
      const v = psi - P.lambda;
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      val[((k - k0) * h + (j - j0)) * w + (i - i0)] = v;
      if (v < minSolid[c]) minSolid[c] = v;
    });
    P.val = val;
  }
  const D = new Float32Array(N);
  for (let c = 0; c < N; c++) D[c] = Math.max(-1, Sall[c] - minSolid[c]);
  sim.D = D;
  sim.renderS = rs;
  return sim;
}

export function simulate(blocks, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (opts.dims === 2 && opts.n === undefined) o.n = 32;
  const sim = setup(blocks, o);
  sim.opts = o;
  run(sim, o);
  finish(sim, o);
  return sim;
}

// ---- sampling helpers (block coordinates) ----

/** Trilinear sample of a full-grid field at block coords (x,y,z). */
export function sampleGrid(sim, arr, x, y, z) {
  const { NX, NY, NZ, n, ox, oy, oz } = sim;
  let gx = (x - ox) * n - 0.5, gy = (y - oy) * n - 0.5, gz = NZ > 1 ? (z - oz) * n - 0.5 : 0;
  gx = Math.min(Math.max(gx, 0), NX - 1.000001); gy = Math.min(Math.max(gy, 0), NY - 1.000001);
  gz = NZ > 1 ? Math.min(Math.max(gz, 0), NZ - 1.000001) : 0;
  const i = Math.floor(gx), j = Math.floor(gy), k = Math.floor(gz);
  const fx = gx - i, fy = gy - j, fz = gz - k;
  const i1 = Math.min(i + 1, NX - 1), j1 = Math.min(j + 1, NY - 1), k1 = NZ > 1 ? Math.min(k + 1, NZ - 1) : k;
  const at = (a, b, c) => arr[(c * NY + b) * NX + a];
  const c00 = at(i, j, k) * (1 - fx) + at(i1, j, k) * fx;
  const c10 = at(i, j1, k) * (1 - fx) + at(i1, j1, k) * fx;
  const c01 = at(i, j, k1) * (1 - fx) + at(i1, j, k1) * fx;
  const c11 = at(i, j1, k1) * (1 - fx) + at(i1, j1, k1) * fx;
  return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
}

/** Trilinear sample of phase p's cost field; BIG outside its box. */
export function samplePhase(sim, p, x, y, z) {
  const P = sim.phases[p];
  if (!P.alive || !P.val) return BIG;
  const { n, ox, oy, oz, NZ } = sim;
  const [i0, j0, k0, i1, j1, k1] = P.box;
  const w = i1 - i0 + 1, h = j1 - j0 + 1, d = k1 - k0 + 1;
  let gx = (x - ox) * n - 0.5 - i0, gy = (y - oy) * n - 0.5 - j0, gz = NZ > 1 ? (z - oz) * n - 0.5 - k0 : 0;
  if (gx < 0 || gy < 0 || gz < 0 || gx > w - 1 || gy > h - 1 || (d > 1 && gz > d - 1)) return BIG;
  const i = Math.min(Math.floor(gx), w - 2), j = Math.min(Math.floor(gy), h - 2), k = d > 1 ? Math.min(Math.floor(gz), d - 2) : 0;
  const fx = gx - i, fy = gy - j, fz = d > 1 ? gz - k : 0;
  const v = P.val;
  const at = (a, b, c) => v[(c * h + b) * w + a];
  const k1_ = d > 1 ? k + 1 : k;
  const c00 = at(i, j, k) * (1 - fx) + at(i + 1, j, k) * fx;
  const c10 = at(i, j + 1, k) * (1 - fx) + at(i + 1, j + 1, k) * fx;
  const c01 = at(i, j, k1_) * (1 - fx) + at(i + 1, j, k1_) * fx;
  const c11 = at(i, j + 1, k1_) * (1 - fx) + at(i + 1, j + 1, k1_) * fx;
  return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
}

/** The solid phase that owns a point (least cost), or 0 when D ≤ 0. */
export function phaseAt(sim, x, y, z) {
  if (sampleGrid(sim, sim.D, x, y, z) <= 0) return 0;
  let best = 0, bv = Infinity;
  for (let p = 1; p < sim.phases.length; p++) {
    const v = samplePhase(sim, p, x, y, z);
    if (v < bv) { bv = v; best = p; }
  }
  return best;
}

/** Volumes (blocks) of the final labels per live phase. */
export function volumes(sim) {
  const counts = new Float64Array(sim.phases.length);
  for (let c = 0; c < sim.N; c++) counts[sim.label[c]]++;
  return sim.phases.map((P, p) => (p && P.alive ? { p, mat: P.mat, blocks: P.blocks, volume: counts[p] / sim.cellVol } : null)).filter(Boolean);
}

