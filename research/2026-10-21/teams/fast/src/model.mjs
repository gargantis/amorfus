// Local "metaball" models of one MBO step from the blocks, evaluated on the
// same grid as an engine reference so fields can be compared and rendered.
//
// Each cluster p (face-connected same-material blocks, as in the engine) has
//   u_p(x) = sum over its blocks of K(x - c_b),  K = k(x)k(y)k(z)
// with k from kern.mjs (erf box profile, or a compact B-spline profile).
// Costs follow the engine (lib/mbo.mjs forEachCandidate / bestOf):
//   air:   Sall (+ fid if the cell was solid at the start)
//   p:     (1 - Sall) + g (Sall - S_mat(p)) + eps (S_mat(p) - u_p)
//          (+ fid if the cell was not in p at the start) - lambda_p
// D = air cost - least solid cost (> 0 solid; surface D = 0), the same
// definition as the engine's finish() field (but from the analytic blur of
// the blocks, not a re-blur of evolved labels).
//
// lambda modes:
//   'none'        lambda = 0 (plain threshold at 1/2 for one material)
//   'exact'       per-cluster lambda solved so each cluster keeps its block
//                 volume (volume measured with a sub-cell smooth indicator)
//   {const: c}    one constant for every cluster
//   {table: fn}   lambda_p = fn(cluster) — a function of local data only
//                 is the "local estimate"; see the caller.
import { setup, DEFAULTS, gaussKernel, blur3 } from '../../../lib/mbo.mjs';
import { kernelByName } from './kern.mjs';

export function buildModel(blocks, gridOpts, opt = {}) {
  const o = { ...DEFAULTS, n: gridOpts.n ?? 16, margin: gridOpts.margin ?? 1.0 };
  const base = setup(blocks, o); // grid + original labels + clusters (engine numbering)
  const { NX, NY, NZ, N, n, ox, oy, oz, phases } = base;
  const orig = base.label;
  const kernel = opt.kernelObj ?? kernelByName(opt.kernel ?? 'gauss', opt.sigma ?? 0.2);
  const g = opt.g ?? 1, eps = opt.eps ?? 0.05, fid = opt.fid ?? 0;
  const sup = Math.min(kernel.support, 0.5 + 5 * kernel.sigma);
  // block list per phase
  const blocksOf = phases.map(() => []);
  for (const b of blocks) {
    const i = Math.round((b[0] + 0.5 - ox) * n - 0.5), j = Math.round((b[1] + 0.5 - oy) * n - 0.5), k = Math.round((b[2] + 0.5 - oz) * n - 0.5);
    const p = orig[(Math.min(k, NZ - 1) * NY + Math.min(j, NY - 1)) * NX + Math.min(i, NX - 1)];
    blocksOf[p].push(b);
  }
  // per-phase u over a box
  const P = [];
  const Sall = new Float32Array(N);
  const Smat = new Map(), Wmat = new Map();
  let lamLocal = null;
  if (opt.lambda && typeof opt.lambda === 'object' && 'local' in opt.lambda) {
    const { a, b, p: pw } = opt.lambda.local;
    const at = new Map(blocks.map((q) => [`${q[0]},${q[1]},${q[2]}`, q[3]]));
    lamLocal = (q) => {
      let cnt = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (at.get(`${q[0] + dx},${q[1] + dy},${q[2] + dz}`) === q[3]) cnt++;
      return a + b * ((27 - cnt) / 26) ** pw;
    };
  }
  const cellsAround = (c0, c1, lo, NA) => [Math.max(0, Math.floor((c0 - sup - lo) * n)), Math.min(NA - 1, Math.ceil((c1 + sup - lo) * n))];
  for (let p = 1; p < phases.length; p++) {
    const bl = blocksOf[p];
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const b of bl) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[0] + 1); y1 = Math.max(y1, b[1] + 1); z1 = Math.max(z1, b[2] + 1); }
    const [i0, i1] = cellsAround(x0, x1, ox, NX), [j0, j1] = cellsAround(y0, y1, oy, NY), [k0, k1] = cellsAround(z0, z1, oz, NZ);
    const w = i1 - i0 + 1, h = j1 - j0 + 1, d = k1 - k0 + 1;
    const u = new Float32Array(w * h * d);
    const kx = new Float64Array(w), ky = new Float64Array(h), kz = new Float64Array(d);
    for (const b of bl) {
      const cx = b[0] + 0.5, cy = b[1] + 0.5, cz = b[2] + 0.5;
      for (let i = 0; i < w; i++) kx[i] = kernel.k(ox + (i0 + i + 0.5) / n - cx);
      for (let j = 0; j < h; j++) ky[j] = kernel.k(oy + (j0 + j + 0.5) / n - cy);
      for (let k = 0; k < d; k++) kz[k] = kernel.k(oz + (k0 + k + 0.5) / n - cz);
      for (let k = 0; k < d; k++) {
        if (kz[k] === 0) continue;
        for (let j = 0; j < h; j++) {
          const a = kz[k] * ky[j];
          if (a === 0) continue;
          const row = (k * h + j) * w;
          for (let i = 0; i < w; i++) u[row + i] += a * kx[i];
        }
      }
    }
    const mat = phases[p].mat;
    if (lamLocal) {
      // per-block lambda_b blended by the same kernel: W_m = sum lambda_b K_b
      if (!Wmat.has(mat)) Wmat.set(mat, new Float32Array(N));
      const W = Wmat.get(mat);
      const ub = new Float32Array(w * h * d);
      for (const b of bl) {
        const lb = lamLocal(b);
        const cx = b[0] + 0.5, cy = b[1] + 0.5, cz = b[2] + 0.5;
        for (let i = 0; i < w; i++) kx[i] = kernel.k(ox + (i0 + i + 0.5) / n - cx);
        for (let j = 0; j < h; j++) ky[j] = kernel.k(oy + (j0 + j + 0.5) / n - cy);
        for (let k = 0; k < d; k++) kz[k] = kernel.k(oz + (k0 + k + 0.5) / n - cz);
        for (let k = 0; k < d; k++) { if (kz[k] === 0) continue; for (let j = 0; j < h; j++) { const a = kz[k] * ky[j] * lb; if (a === 0) continue; const row = (k * h + j) * w; for (let i = 0; i < w; i++) ub[row + i] += a * kx[i]; } }
      }
      for (let k = 0; k < d; k++) for (let j = 0; j < h; j++) {
        const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * h + j) * w;
        for (let i = 0; i < w; i++) W[g0 + i] += ub[b0 + i];
      }
    }
    if (!Smat.has(mat)) Smat.set(mat, new Float32Array(N));
    const Sm = Smat.get(mat);
    for (let k = 0; k < d; k++) for (let j = 0; j < h; j++) {
      const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * h + j) * w;
      for (let i = 0; i < w; i++) { Sall[g0 + i] += u[b0 + i]; Sm[g0 + i] += u[b0 + i]; }
    }
    P[p] = { p, mat, blocks: bl.length, box: [i0, j0, k0, i1, j1, k1], w, h, d, u, lambda: 0 };
  }
  // phase cost without lambda, over the box (BIG where not a candidate)
  const BIG = 9;
  for (let p = 1; p < phases.length; p++) {
    const Q = P[p];
    const [i0, j0, k0] = Q.box;
    const Sm = Smat.get(Q.mat);
    const psi = new Float32Array(Q.u.length).fill(BIG);
    for (let k = 0; k < Q.d; k++) for (let j = 0; j < Q.h; j++) {
      const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * Q.h + j) * Q.w;
      for (let i = 0; i < Q.w; i++) {
        const ui = Q.u[b0 + i];
        if (ui < 1e-5) continue;
        const c = g0 + i, sa = Sall[c], sm = Sm[c];
        let v = (1 - sa) + g * (sa - sm) + eps * (sm - ui);
        if (fid && orig[c] !== p) v += fid;
        if (lamLocal) v -= Wmat.get(Q.mat)[c] / Math.max(sm, 1e-9);
        psi[b0 + i] = v;
      }
    }
    Q.psi = psi;
  }
  const air = new Float32Array(N);
  for (let c = 0; c < N; c++) air[c] = Sall[c] + (fid && orig[c] !== 0 ? fid : 0);

  const model = { NX, NY, NZ, N, n, ox, oy, oz, Sall, Smat, Wmat, P, air, orig, phasesBase: phases, blocks, opt, kernel };
  // lambdas
  const lm = opt.lambda ?? 'none';
  if (lm === 'exact') solveExact(model);
  else if (lm && typeof lm === 'object' && 'const' in lm) for (let p = 1; p < P.length; p++) P[p].lambda = lm.const;
  else if (lm && typeof lm === 'object' && 'table' in lm) for (let p = 1; p < P.length; p++) P[p].lambda = lm.table(P[p], model);
  compose(model);
  return model;
}

/** least solid cost and owner per cell for the current lambdas; D; per-material cost fields */
export function compose(model) {
  const { NX, NY, NZ, N, P, air } = model;
  const best = new Float32Array(N).fill(9), bestPh = new Uint8Array(N);
  const Cm = new Map();
  for (let p = 1; p < P.length; p++) {
    const Q = P[p];
    if (!Cm.has(Q.mat)) Cm.set(Q.mat, new Float32Array(N).fill(9));
    const C = Cm.get(Q.mat);
    const [i0, j0, k0] = Q.box;
    for (let k = 0; k < Q.d; k++) for (let j = 0; j < Q.h; j++) {
      const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * Q.h + j) * Q.w;
      for (let i = 0; i < Q.w; i++) {
        const v = Q.psi[b0 + i] - Q.lambda;
        const c = g0 + i;
        if (v < best[c]) { best[c] = v; bestPh[c] = p; }
        if (v < C[c]) C[c] = v;
      }
    }
  }
  const D = new Float32Array(N);
  for (let c = 0; c < N; c++) D[c] = Math.max(-1, air[c] - best[c]);
  model.D = D; model.bestPh = bestPh; model.Cm = Cm;
  // render-compatible pseudo phases: one per material
  model.phases = [{ mat: 0 }];
  for (const [mat, C] of Cm) model.phases.push({ mat, alive: true, box: [0, 0, 0, NX - 1, NY - 1, NZ - 1], val: C });
  return model;
}

/** gradient magnitude (per block) of a full-grid field by central differences */
export function gradMag(model, F, c) {
  const { NX, NY, NZ, n } = model;
  const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
  const dx = (i > 0 && i < NX - 1) ? (F[c + 1] - F[c - 1]) * 0.5 : (i > 0 ? F[c] - F[c - 1] : F[c + 1] - F[c]);
  const dy = (j > 0 && j < NY - 1) ? (F[c + NX] - F[c - NX]) * 0.5 : (j > 0 ? F[c] - F[c - NX] : F[c + NX] - F[c]);
  const s = NX * NY;
  const dz = NZ > 1 ? ((k > 0 && k < NZ - 1) ? (F[c + s] - F[c - s]) * 0.5 : (k > 0 ? F[c] - F[c - s] : F[c + s] - F[c])) : 0;
  return Math.hypot(dx, dy, dz) * n;
}

/** Smooth per-material volume of D > 0 (blocks^3): each cell counts
 *  clamp(1/2 + sd/h, 0, 1) with sd = D/|grad D| (first-order signed distance). */
export function fracVolumes(model, D, ownerMatOf) {
  const { N, n } = model;
  const vol = new Map();
  for (let c = 0; c < N; c++) {
    const v = D[c];
    if (v < -0.6) continue;
    const G = Math.max(gradMag(model, D, c), 1e-3);
    const f = Math.min(1, Math.max(0, 0.5 + (v / G) * n));
    if (f <= 0) continue;
    const m = ownerMatOf(c);
    vol.set(m, (vol.get(m) ?? 0) + f);
  }
  const out = {};
  for (const [m, v] of vol) out[m] = v / (n * n * n);
  return out;
}

/** Per-cluster lambdas so each cluster's smooth volume equals its blocks. */
/** Lambdas so each group keeps its block volume. Groups: 'material' (all
 *  clusters of one material share one lambda; same-material clusters unite
 *  in this model, so per-cluster volumes are ill-posed when they touch) or
 *  'cluster'. Volume uses a sub-cell smooth indicator (clamp(1/2 + sd/h)). */
function solveExact(model, sweeps = 8, mode = model.opt.exactMode ?? 'material') {
  const { NX, NY, N, n, P, air } = model;
  const groups = new Map();
  for (let p = 1; p < P.length; p++) {
    const key = mode === 'cluster' ? p : P[p].mat;
    if (!groups.has(key)) groups.set(key, { ps: [], blocks: 0, lambda: 0 });
    const G = groups.get(key); G.ps.push(p); G.blocks += P[p].blocks;
  }
  const GL = [...groups.values()];
  // group cost (min over its clusters, no lambda) on a candidate list
  for (const G of GL) {
    const cost = new Float32Array(N).fill(9);
    for (const p of G.ps) {
      const Q = P[p];
      const [i0, j0, k0] = Q.box;
      for (let k = 0; k < Q.d; k++) for (let j = 0; j < Q.h; j++) {
        const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * Q.h + j) * Q.w;
        for (let i = 0; i < Q.w; i++) { const v = Q.psi[b0 + i]; if (v < cost[g0 + i]) cost[g0 + i] = v; }
      }
    }
    const cand = [];
    for (let c = 0; c < N; c++) if (cost[c] < 8) cand.push(c);
    G.cand = Int32Array.from(cand);
    G.cost = new Float32Array(cand.length);
    G.grad = new Float32Array(cand.length);
    const S = NX * NY;
    const F = (c, c0) => (c >= 0 && c < N && cost[c] < 8 ? air[c] - cost[c] : air[c0] - cost[c0]);
    for (let q = 0; q < cand.length; q++) {
      const c = cand[q];
      G.cost[q] = cost[c];
      const i = c % NX, j = Math.floor(c / NX) % NY;
      const gx = ((i < NX - 1 ? F(c + 1, c) : F(c, c)) - (i > 0 ? F(c - 1, c) : F(c, c))) * 0.5;
      const gy = ((j < NY - 1 ? F(c + NX, c) : F(c, c)) - (j > 0 ? F(c - NX, c) : F(c, c))) * 0.5;
      const gz = (F(c + S, c) - F(c - S, c)) * 0.5;
      G.grad[q] = Math.max(1e-3, Math.hypot(gx, gy, gz) * n);
    }
  }
  const best = new Float32Array(N), second = new Float32Array(N), bestG = new Int16Array(N);
  for (let sweep = 0; sweep < sweeps; sweep++) {
    best.fill(9); second.fill(9); bestG.fill(-1);
    GL.forEach((G, gi) => {
      for (let q = 0; q < G.cand.length; q++) {
        const c = G.cand[q], v = G.cost[q] - G.lambda;
        if (v < best[c]) { second[c] = best[c]; best[c] = v; bestG[c] = gi; } else if (v < second[c]) second[c] = v;
      }
    });
    let worst = 0;
    const next = [];
    GL.forEach((G, gi) => {
      const target = G.blocks * n * n * n;
      const vol = (lam) => {
        let s = 0;
        for (let q = 0; q < G.cand.length; q++) {
          const c = G.cand[q];
          const v = G.cost[q] - lam;
          const other = bestG[c] === gi ? second[c] : best[c];
          if (!(v < other)) continue;
          const f = 0.5 + ((air[c] - v) / G.grad[q]) * n;
          s += f >= 1 ? 1 : f <= 0 ? 0 : f;
        }
        return s;
      };
      let lo = -1, hi = 1;
      for (let it = 0; it < 32; it++) { const m = 0.5 * (lo + hi); if (vol(m) < target) lo = m; else hi = m; }
      const lam = 0.5 * (lo + hi);
      worst = Math.max(worst, Math.abs(lam - G.lambda));
      next.push([G, lam]);
    });
    for (const [G, lam] of next) G.lambda = lam;
    if (worst < 1e-5) break;
  }
  for (const G of GL) for (const p of G.ps) P[p].lambda = G.lambda;
}

/** Iterate further steps from the model's labels with the engine's discrete
 *  Gaussian blur (s sub-cells), engine costs, fixed lambdas (or none). */
export function iterate(model, steps, { s = 0.2 * model.n, lambdaMode = 'keep' } = {}) {
  const { NX, NY, NZ, N, P, orig } = model;
  const ker = gaussKernel(s);
  const g = model.opt.g ?? 1, eps = model.opt.eps ?? 0.05, fid = model.opt.fid ?? 0;
  for (let t = 0; t < steps; t++) {
    const label = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (model.D[c] > 0) label[c] = model.bestPh[c];
    const Sall = new Float32Array(N);
    const Smat = new Map();
    for (let p = 1; p < P.length; p++) {
      const Q = P[p];
      const [i0, j0, k0] = Q.box;
      const u = new Float32Array(Q.u.length);
      for (let k = 0; k < Q.d; k++) for (let j = 0; j < Q.h; j++) {
        const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * Q.h + j) * Q.w;
        for (let i = 0; i < Q.w; i++) u[b0 + i] = label[g0 + i] === p ? 1 : 0;
      }
      blur3(u, Q.w, Q.h, Q.d, ker);
      Q.u = u;
      if (!Smat.has(Q.mat)) Smat.set(Q.mat, new Float32Array(N));
      const Sm = Smat.get(Q.mat);
      for (let k = 0; k < Q.d; k++) for (let j = 0; j < Q.h; j++) {
        const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * Q.h + j) * Q.w;
        for (let i = 0; i < Q.w; i++) { Sall[g0 + i] += u[b0 + i]; Sm[g0 + i] += u[b0 + i]; }
      }
    }
    for (let p = 1; p < P.length; p++) {
      const Q = P[p];
      const [i0, j0, k0] = Q.box;
      const Sm = Smat.get(Q.mat);
      for (let k = 0; k < Q.d; k++) for (let j = 0; j < Q.h; j++) {
        const g0 = ((k + k0) * NY + (j + j0)) * NX + i0, b0 = (k * Q.h + j) * Q.w;
        for (let i = 0; i < Q.w; i++) {
          const ui = Q.u[b0 + i], c = g0 + i;
          if (ui < 1e-5) { Q.psi[b0 + i] = 9; continue; }
          const sa = Sall[c], sm = Sm[c];
          let v = (1 - sa) + g * (sa - sm) + eps * (sm - ui);
          if (fid && orig[c] !== p) v += fid;
          Q.psi[b0 + i] = v;
        }
      }
    }
    for (let c = 0; c < N; c++) model.air[c] = Sall[c] + (fid && orig[c] !== 0 ? fid : 0);
    model.Sall = Sall; model.Smat = Smat;
    if (lambdaMode === 'exact') solveExact(model);
    compose(model);
  }
  return model;
}
