// Independent 2D foam solver (team phys). Not derived from lib/mbo.mjs.
//
// Films are polylines whose end points are shared junction vertices; every
// point is free. Each film separates a left and a right region (0 = air,
// the unconstrained exterior; k >= 1 = bubble with a fixed target area).
// Energy = sum over films of tension x length; tension 1 for bubble/air, g
// for two different materials, 0 for the same material (those merge).
// Dynamics: explicit gradient flow on the energy, with the area constraints
// enforced by Lagrange multipliers (the velocity is projected so that no
// area changes to first order; the multipliers are the bubble pressures)
// plus a Newton projection that removes the residual area drift.
// Topology: same-material regions sharing a film merge (the film vanishes);
// a junction where 4 films meet is split into two triple junctions in the
// direction that lowers the energy fastest (a T1-type split); a film
// between two junctions that shrinks below dT1 is collapsed and re-split
// (T1). Approach of two same-material bubbles through air is detected and
// reported (event 'contact'), not merged.
import { clusters } from '../../lib/mbo.mjs';

export class Foam {
  constructor({ g = 1, h = 0.04, mats = [] } = {}) {
    this.g = g; this.h = h;
    this.X = []; this.Y = []; this.isJ = [];
    this.films = []; // { idx: [...], L, R, closed }
    this.regions = [{ mat: 0, target: 0, parent: 0 }];
    this.events = [];
    this.t = 0;
    this.keepAngle = (25 * Math.PI) / 180;
  }

  find(r) { while (this.regions[r].parent !== r) r = this.regions[r].parent; return r; }
  mat(r) { return this.regions[this.find(r)].mat; }
  sigma(L, R) {
    L = this.find(L); R = this.find(R);
    if (L === R) return 0;
    if (L === 0 || R === 0) return 1;
    return this.mat(L) === this.mat(R) ? 0 : this.g;
  }
  bubbles() { return this.regions.map((r, i) => i).filter((i) => i > 0 && this.find(i) === i); }

  // ---------- geometry ----------
  segs(f) {
    const n = f.idx.length;
    const out = [];
    for (let i = 0; i + 1 < n; i++) out.push([f.idx[i], f.idx[i + 1]]);
    if (f.closed) out.push([f.idx[n - 1], f.idx[0]]);
    return out;
  }
  filmLength(f) { let s = 0; for (const [a, b] of this.segs(f)) s += Math.hypot(this.X[b] - this.X[a], this.Y[b] - this.Y[a]); return s; }
  energy() { let E = 0; for (const f of this.films) E += this.sigma(f.L, f.R) * this.filmLength(f); return E; }
  areas() {
    const A = new Map();
    for (const f of this.films) {
      let s = 0;
      for (const [a, b] of this.segs(f)) s += 0.5 * (this.X[a] * this.Y[b] - this.X[b] * this.Y[a]);
      const L = this.find(f.L), R = this.find(f.R);
      A.set(L, (A.get(L) ?? 0) + s); A.set(R, (A.get(R) ?? 0) - s);
    }
    return A;
  }

  /** Sparse area gradients: per point up to K (region, gx, gy) slots. */
  areaGrads() {
    const np = this.X.length, K = 6;
    const reg = new Int32Array(np * K).fill(-1), gx = new Float64Array(np * K), gy = new Float64Array(np * K), cnt = new Uint8Array(np);
    const add = (i, r, x, y) => {
      if (r === 0) return;
      const b = i * K;
      for (let k = 0; k < cnt[i]; k++) if (reg[b + k] === r) { gx[b + k] += x; gy[b + k] += y; return; }
      const k = cnt[i]++;
      reg[b + k] = r; gx[b + k] = x; gy[b + k] = y;
    };
    for (const f of this.films) {
      const L = this.find(f.L), R = this.find(f.R);
      const idx = f.idx, n = idx.length, X = this.X, Y = this.Y;
      const ns = f.closed ? n : n - 1;
      for (let s = 0; s < ns; s++) {
        const a = idx[s], b = idx[(s + 1) % n];
        const ax = 0.5 * Y[b], ay = -0.5 * X[b], bx = -0.5 * Y[a], by = 0.5 * X[a];
        add(a, L, ax, ay); add(b, L, bx, by); add(a, R, -ax, -ay); add(b, R, -bx, -by);
      }
    }
    return { reg, gx, gy, cnt, K };
  }

  forces() {
    const np = this.X.length;
    const FX = new Float64Array(np), FY = new Float64Array(np);
    const X = this.X, Y = this.Y;
    for (const f of this.films) {
      const s = this.sigma(f.L, f.R);
      if (!s) continue;
      const idx = f.idx, n = idx.length, ns = f.closed ? n : n - 1;
      for (let t = 0; t < ns; t++) {
        const a = idx[t], b = idx[(t + 1) % n];
        const dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy) || 1e-12;
        FX[a] += s * dx / l; FY[a] += s * dy / l; FX[b] -= s * dx / l; FY[b] -= s * dy / l;
      }
    }
    return { FX, FY };
  }

  /** Gram matrix of the area gradients for the bubbles in ids. */
  _gram(ids, G) {
    const k = ids.length, pos = new Int32Array(this.regions.length).fill(-1);
    ids.forEach((r, i) => { pos[r] = i; });
    const M = Array.from({ length: k }, () => new Float64Array(k));
    const { reg, gx, gy, cnt, K } = G;
    for (let i = 0; i < cnt.length; i++) {
      const b = i * K;
      for (let u = 0; u < cnt[i]; u++) {
        const pu = pos[reg[b + u]]; if (pu < 0) continue;
        for (let v = 0; v < cnt[i]; v++) {
          const pv = pos[reg[b + v]]; if (pv < 0) continue;
          M[pu][pv] += gx[b + u] * gx[b + v] + gy[b + u] * gy[b + v];
        }
      }
    }
    return { M, pos };
  }

  step(tau) {
    const ids = this.bubbles();
    const G = this.areaGrads();
    const { FX, FY } = this.forces();
    const { M, pos } = this._gram(ids, G);
    const { reg, gx, gy, cnt, K } = G;
    const b = new Array(ids.length).fill(0);
    for (let i = 0; i < cnt.length; i++) for (let u = 0; u < cnt[i]; u++) { const p = pos[reg[i * K + u]]; if (p >= 0) b[p] += gx[i * K + u] * FX[i] + gy[i * K + u] * FY[i]; }
    const lam = solveDense(M, b.map((v) => -v));
    let vmax = 0, vjmax = 0;
    const np = this.X.length;
    for (let i = 0; i < np; i++) {
      let vx = FX[i], vy = FY[i];
      for (let u = 0; u < cnt[i]; u++) { const p = pos[reg[i * K + u]]; if (p >= 0) { vx += lam[p] * gx[i * K + u]; vy += lam[p] * gy[i * K + u]; } }
      this.X[i] += tau * vx; this.Y[i] += tau * vy;
      const v = Math.hypot(vx, vy);
      if (v > vmax) vmax = v;
      if (this.isJ[i] && v > vjmax) vjmax = v;
    }
    this.project(1);
    this.t += tau;
    // pressures = the multipliers (energy per unit area)
    this.pressure = new Map(ids.map((r, i) => [r, lam[i]]));
    return { vmax, vjmax };
  }

  project(iters = 2) {
    const ids = this.bubbles();
    for (let it = 0; it < iters; it++) {
      const A = this.areas();
      const G = this.areaGrads();
      const { M, pos } = this._gram(ids, G);
      const d = ids.map((r) => this.regions[r].target - (A.get(r) ?? 0));
      const mu = solveDense(M, d);
      const { reg, gx, gy, cnt, K } = G;
      for (let i = 0; i < cnt.length; i++) for (let u = 0; u < cnt[i]; u++) {
        const p = pos[reg[i * K + u]];
        if (p >= 0) { this.X[i] += mu[p] * gx[i * K + u]; this.Y[i] += mu[p] * gy[i * K + u]; }
      }
    }
  }

  // ---------- remeshing ----------
  remesh(h = this.h) {
    const X = [], Y = [], isJ = [];
    const map = new Map();
    // junctions keep their identity (in order)
    for (let i = 0; i < this.X.length; i++) if (this.isJ[i]) { map.set(i, X.length); X.push(this.X[i]); Y.push(this.Y[i]); isJ.push(true); }
    const films = [];
    for (const f of this.films) {
      const pts = f.idx.map((i) => [this.X[i], this.Y[i]]);
      if (f.closed) pts.push(pts[0]);
      // keep sharp corners (turning angle > keepAngle) as fixed break points
      const brk = [0];
      for (let i = 1; i < pts.length - 1; i++) {
        const ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1], bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
        const c = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
        if (c < Math.cos(this.keepAngle)) brk.push(i);
      }
      brk.push(pts.length - 1);
      const idx = [];
      if (!f.closed) idx.push(map.get(f.idx[0]));
      for (let q = 0; q + 1 < brk.length; q++) {
        const sub = pts.slice(brk[q], brk[q + 1] + 1);
        const cum = [0];
        for (let i = 1; i < sub.length; i++) cum.push(cum[i - 1] + Math.hypot(sub[i][0] - sub[i - 1][0], sub[i][1] - sub[i - 1][1]));
        const len = cum[cum.length - 1];
        const m = Math.max(f.closed && brk.length === 2 ? 8 : 1, Math.round(len / h));
        let seg = 0;
        // points k = (start excluded unless closed&first) .. m (end included unless it is the film end)
        const kStart = q === 0 ? (f.closed ? 0 : 1) : 1;
        const last = q + 2 === brk.length;
        const kEnd = last ? m - 1 : m;
        for (let k = kStart; k <= kEnd; k++) {
          const s0 = (len * k) / m;
          while (seg < cum.length - 2 && cum[seg + 1] < s0) seg++;
          const t = (s0 - cum[seg]) / Math.max(1e-15, cum[seg + 1] - cum[seg]);
          X.push(sub[seg][0] + t * (sub[seg + 1][0] - sub[seg][0])); Y.push(sub[seg][1] + t * (sub[seg + 1][1] - sub[seg][1])); isJ.push(false);
          idx.push(X.length - 1);
        }
      }
      if (!f.closed) idx.push(map.get(f.idx[f.idx.length - 1]));
      films.push({ ...f, idx });
    }
    this.X = X; this.Y = Y; this.isJ = isJ; this.films = films;
    this.project(3);
  }

  // ---------- topology ----------
  /** Films incident to junction j, each oriented away from j. */
  around(j) {
    const out = [];
    this.films.forEach((f, fi) => {
      if (f.closed) return;
      const n = f.idx.length;
      if (f.idx[0] === j) out.push({ fi, end: 0, next: f.idx[1], left: f.L, right: f.R });
      if (f.idx[n - 1] === j) out.push({ fi, end: 1, next: f.idx[n - 2], left: f.R, right: f.L });
    });
    for (const o of out) {
      // direction from a few points along the film (robust to a short first segment)
      const f = this.films[o.fi];
      const seq = o.end === 0 ? f.idx : [...f.idx].reverse();
      let k = 1, d = 0;
      while (k < seq.length - 1 && d < 1.5 * this.h) { d = Math.hypot(this.X[seq[k]] - this.X[j], this.Y[seq[k]] - this.Y[j]); if (d < 1.5 * this.h) k++; }
      const q = seq[Math.min(k, seq.length - 1)];
      const dx = this.X[q] - this.X[j], dy = this.Y[q] - this.Y[j], l = Math.hypot(dx, dy) || 1e-12;
      o.t = [dx / l, dy / l]; o.ang = Math.atan2(dy, dx);
      o.sigma = this.sigma(f.L, f.R);
    }
    return out.sort((a, b) => a.ang - b.ang);
  }

  /** Merge regions of the same material that share a film; drop films with
   *  the same region on both sides; dissolve degree-2 junctions. */
  cleanup() {
    let changed = true, any = false;
    while (changed) {
      changed = false;
      for (const f of this.films) {
        const L = this.find(f.L), R = this.find(f.R);
        if (L !== R && L && R && this.mat(L) === this.mat(R)) {
          this.regions[R].parent = L;
          this.regions[L].target += this.regions[R].target;
          this.events.push({ t: this.t, kind: 'merge', a: L, b: R, mat: this.mat(L) });
          changed = any = true;
        }
      }
      const keep = this.films.filter((f) => this.find(f.L) !== this.find(f.R));
      if (keep.length !== this.films.length) { this.films = keep; changed = any = true; }
      for (const f of this.films) { f.L = this.find(f.L); f.R = this.find(f.R); }
      // degree-2 junctions
      for (let j = 0; j < this.X.length; j++) {
        if (!this.isJ[j]) continue;
        const a = this.around(j);
        if (a.length === 0) { this.isJ[j] = false; continue; }
        if (a.length !== 2) continue;
        const [p, q] = a;
        if (p.fi === q.fi) { // a loop through j: make it a closed film
          const f = this.films[p.fi];
          f.idx = f.idx.slice(0, -1); f.closed = true; this.isJ[j] = false; changed = any = true; continue;
        }
        const f1 = this.films[p.fi], f2 = this.films[q.fi];
        // orient f1 to end at j, f2 to start at j
        const s1 = p.end === 1 ? f1.idx : [...f1.idx].reverse();
        const L1 = p.end === 1 ? f1.L : f1.R, R1 = p.end === 1 ? f1.R : f1.L;
        const s2 = q.end === 0 ? f2.idx : [...f2.idx].reverse();
        const nf = { idx: [...s1, ...s2.slice(1)], L: L1, R: R1, closed: false };
        if (nf.idx[0] === nf.idx[nf.idx.length - 1]) { nf.idx.pop(); nf.closed = true; }
        this.films = this.films.filter((_, i) => i !== p.fi && i !== q.fi);
        this.films.push(nf);
        this.isJ[j] = false;
        changed = any = true;
      }
    }
    return any;
  }

  /** Split options of a degree-4 junction: [{pairs, makesAdjacent, rate, e}]. */
  splitOptions(j) {
    const a = this.around(j);
    if (a.length !== 4) return null;
    const sect = (i) => this.find(a[i].left); // region ccw of film i (between i and i+1)
    const opts = [];
    for (const off of [0, 1]) {
      const i1 = off, i2 = off + 1, i3 = (off + 2) % 4, i4 = (off + 3) % 4;
      const Fa = [a[i1].sigma * a[i1].t[0] + a[i2].sigma * a[i2].t[0], a[i1].sigma * a[i1].t[1] + a[i2].sigma * a[i2].t[1]];
      const Fb = [a[i3].sigma * a[i3].t[0] + a[i4].sigma * a[i4].t[0], a[i3].sigma * a[i3].t[1] + a[i4].sigma * a[i4].t[1]];
      const d = [Fa[0] - Fb[0], Fa[1] - Fb[1]], dl = Math.hypot(d[0], d[1]) || 1e-12;
      // regions that become adjacent: the sector between i2 and i3, and between i4 and i1
      const r1 = sect(i2), r2 = sect(i4);
      const s = this.sigma(r1, r2);
      opts.push({ groupA: [a[i1], a[i2]], groupB: [a[i3], a[i4]], makesAdjacent: [r1, r2], mats: [this.mat(r1), this.mat(r2)], sigmaNew: s, rate: 0.5 * dl - s, e: [d[0] / dl, d[1] / dl] });
    }
    return opts;
  }

  /** Execute a split option at junction j with new film length delta. */
  doSplit(j, opt, delta) {
    const x = this.X[j], y = this.Y[j];
    const jb = this.X.length;
    this.X.push(x - 0.5 * delta * opt.e[0]); this.Y.push(y - 0.5 * delta * opt.e[1]); this.isJ.push(true);
    this.X[j] = x + 0.5 * delta * opt.e[0]; this.Y[j] = y + 0.5 * delta * opt.e[1];
    for (const o of opt.groupB) {
      const f = this.films[o.fi];
      if (o.end === 0) f.idx[0] = jb; else f.idx[f.idx.length - 1] = jb;
    }
    const [r1, r2] = opt.makesAdjacent;
    // orientation: new film from jb to j (direction e); left side = region on perp(e)
    const perp = [-opt.e[1], opt.e[0]];
    const g1 = opt.groupA[1].t, g2 = opt.groupB[0].t; // sector r1 lies between groupA[1] and groupB[0]
    const left1 = perp[0] * (g1[0] + g2[0]) + perp[1] * (g1[1] + g2[1]) > 0;
    this.films.push({ idx: [jb, j], L: left1 ? r1 : r2, R: left1 ? r2 : r1, closed: false });
    this.events.push({ t: this.t, kind: 'split', at: [x, y], adjacent: [r1, r2], mats: opt.mats, rate: opt.rate });
    this.cleanup();
    this.remesh();
  }

  /** Collapse film fi (between two distinct junctions) into one 4-fold junction. */
  collapse(fi) {
    const f = this.films[fi];
    const a = f.idx[0], b = f.idx[f.idx.length - 1];
    this.X[a] = 0.5 * (this.X[a] + this.X[b]); this.Y[a] = 0.5 * (this.Y[a] + this.Y[b]);
    this.films.splice(fi, 1);
    for (const g of this.films) { if (g.idx[0] === b) g.idx[0] = a; if (g.idx[g.idx.length - 1] === b) g.idx[g.idx.length - 1] = a; }
    this.isJ[b] = false;
    this.events.push({ t: this.t, kind: 'collapse', at: [this.X[a], this.Y[a]], sep: [f.L, f.R] });
    return a;
  }

  /** Same-material bubbles closer than d through air (different films). */
  contacts(d) {
    const own = [];
    this.films.forEach((f) => {
      const L = this.find(f.L), R = this.find(f.R);
      if (L && R) return;
      const b = L || R;
      for (const i of f.idx) if (!this.isJ[i]) own.push([i, b]);
    });
    const out = [];
    const cell = new Map();
    const key = (x, y) => `${Math.floor(x / d)},${Math.floor(y / d)}`;
    for (const [i, b] of own) { const k = key(this.X[i], this.Y[i]); if (!cell.has(k)) cell.set(k, []); cell.get(k).push([i, b]); }
    for (const [i, b] of own) {
      const cx = Math.floor(this.X[i] / d), cy = Math.floor(this.Y[i] / d);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [k, c] of cell.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (c === b || k <= i) continue;
        if (Math.hypot(this.X[i] - this.X[k], this.Y[i] - this.Y[k]) < d) out.push({ a: b, b: c, same: this.mat(b) === this.mat(c), at: [this.X[i], this.Y[i]] });
      }
    }
    return out;
  }

  run({ maxTime = 40, tauF = 0.2, tol = 1e-6, choose = null, holdTime = 0.02, tieTol = 1e-3, dT1 = null, remeshEvery = 25, contactD = null, log = false } = {}) {
    const dT = dT1 ?? 0.5 * this.h;
    const cD = contactD ?? 0.5 * this.h;
    let steps = 0, prevLens = new Map();
    let res = {};
    let Eprev = this.energy(), quiet = 0;
    while (this.t < maxTime) {
      // 4-fold junctions
      for (let j = 0; j < this.X.length; j++) {
        if (!this.isJ[j]) continue;
        const opts = this.splitOptions(j);
        if (!opts) continue;
        const [o0, o1] = opts;
        const best = Math.max(o0.rate, o1.rate);
        if (best <= 0) continue;
        const decided = Math.abs(o0.rate - o1.rate) > tieTol;
        if (!decided && this.t < holdTime) continue;
        let pick = o0.rate >= o1.rate ? 0 : 1;
        if (choose) { const c = choose(opts, this, decided); if (c !== null && c !== undefined) pick = c; }
        if (opts[pick].rate <= 0) pick = 1 - pick;
        this.events.push({ t: this.t, kind: 'decide', at: [this.X[j], this.Y[j]], options: opts.map((o) => ({ mats: o.mats, rate: o.rate })), decided, pick });
        this.doSplit(j, opts[pick], 2 * dT);
        j = -1; // restart scan (indices changed by remesh)
      }
      // T1: shrinking short films between distinct junctions
      for (let fi = 0; fi < this.films.length; fi++) {
        const f = this.films[fi];
        if (f.closed) continue;
        const a = f.idx[0], b = f.idx[f.idx.length - 1];
        if (a === b) continue;
        const L = this.filmLength(f);
        const key = `${Math.min(a, b)}-${Math.max(a, b)}-${f.L}-${f.R}`;
        const prev = prevLens.get(key);
        prevLens.set(key, L);
        if (L < dT && prev !== undefined && L < prev) {
          const jn = this.collapse(fi);
          this.remesh();
          const opts = this.splitOptions(jn);
          if (opts) {
            let pick = opts[0].rate >= opts[1].rate ? 0 : 1;
            if (choose) { const c = choose(opts, this, true); if (c !== null && c !== undefined) pick = c; }
            this.doSplit(jn, opts[pick], 3 * dT);
          }
          prevLens = new Map();
          fi = -1;
        }
      }
      // contacts through air (report only)
      if (steps % 50 === 0) {
        const c = this.contacts(cD);
        if (c.length) { this.events.push({ t: this.t, kind: 'contact', list: c.slice(0, 4) }); res.contact = c[0]; break; }
      }
      let hmin = Infinity;
      for (const f of this.films) for (const [p, q] of this.segs(f)) hmin = Math.min(hmin, Math.hypot(this.X[q] - this.X[p], this.Y[q] - this.Y[p]));
      const tau = tauF * Math.max(hmin, 0.2 * this.h);
      const r = this.step(tau);
      steps++;
      if (steps % remeshEvery === 0) this.remesh();
      if (steps % 200 === 0) {
        const E = this.energy();
        if (log) console.log(`t ${this.t.toFixed(3)} E ${E.toFixed(6)} vmax ${r.vmax.toExponential(2)} vj ${r.vjmax.toExponential(2)}`);
        quiet = Math.abs(Eprev - E) < tol * 200 * tau ? quiet + 1 : 0;
        Eprev = E;
        if (quiet >= 3 && this.t > holdTime) { res.converged = true; break; }
      }
    }
    res.steps = steps; res.t = this.t; res.E = this.energy();
    return res;
  }

  // ---------- measurement ----------
  junctionAngles() {
    const out = [];
    for (let j = 0; j < this.X.length; j++) {
      if (!this.isJ[j]) continue;
      const a = this.around(j);
      // tangent from a quadratic fit over the first ~0.15 block of each film
      const dirs = a.map((o) => {
        const f = this.films[o.fi];
        const seq = o.end === 0 ? f.idx : [...f.idx].reverse();
        const pts = [];
        let s = 0;
        for (let k = 1; k < seq.length && s < 0.15; k++) { s += Math.hypot(this.X[seq[k]] - this.X[seq[k - 1]], this.Y[seq[k]] - this.Y[seq[k - 1]]); pts.push([s, this.X[seq[k]] - this.X[j], this.Y[seq[k]] - this.Y[j]]); }
        // fit x(s) = a1 s + a2 s^2, y(s) likewise (through the junction)
        let s2 = 0, s3 = 0, s4 = 0, xs = 0, xs2 = 0, ys = 0, ys2 = 0;
        for (const [t, x, y] of pts) { s2 += t * t; s3 += t ** 3; s4 += t ** 4; xs += x * t; xs2 += x * t * t; ys += y * t; ys2 += y * t * t; }
        const det = s2 * s4 - s3 * s3;
        const ax = (xs * s4 - xs2 * s3) / det, ay = (ys * s4 - ys2 * s3) / det;
        const ang = Math.atan2(ay, ax);
        return { ang, left: this.find(o.left) };
      }).sort((p, q) => p.ang - q.ang);
      const sectors = dirs.map((d, i) => {
        const nx = dirs[(i + 1) % dirs.length];
        let da = nx.ang - d.ang; if (da <= 0) da += 2 * Math.PI;
        return { region: d.left, mat: this.mat(d.left), deg: (da * 180) / Math.PI };
      });
      out.push({ j, at: [this.X[j], this.Y[j]], degree: a.length, sectors });
    }
    return out;
  }

  filmFits() {
    return this.films.map((f) => {
      const pts = f.idx.map((i) => [this.X[i], this.Y[i]]);
      const c = circleFit(pts);
      return { L: this.find(f.L), R: this.find(f.R), mats: [this.mat(f.L), this.mat(f.R)], length: this.filmLength(f), closed: !!f.closed, ...c };
    });
  }

  summary() {
    const A = this.areas();
    return {
      t: this.t, energy: this.energy(),
      bubbles: this.bubbles().map((r) => ({ r, mat: this.mat(r), target: this.regions[r].target, area: A.get(r), pressure: this.pressure?.get(r) })),
      junctions: this.junctionAngles(), films: this.filmFits(), events: this.events.filter((e) => e.kind !== 'contact' || true),
    };
  }

  polylines() { return this.films.map((f) => ({ pts: (f.closed ? [...f.idx, f.idx[0]] : f.idx).map((i) => [this.X[i], this.Y[i]]), L: this.find(f.L), R: this.find(f.R) })); }
}

export function circleFit(pts) {
  // Kasa fit; returns radius, rms and max deviation; straight lines give huge r
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  const n = pts.length;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z; }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [-sxz, -syz, -sz];
  const s = solveDense(M, b);
  const cx = -s[0] / 2, cy = -s[1] / 2, r = Math.sqrt(cx * cx + cy * cy - s[2]);
  let ss = 0, mx = 0;
  for (const [x, y] of pts) { const d = Math.hypot(x - cx, y - cy) - r; ss += d * d; mx = Math.max(mx, Math.abs(d)); }
  return { cx, cy, r, rms: Math.sqrt(ss / n), maxDev: mx };
}

export function solveDense(A, b) {
  const m = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) continue;
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[m] / r[i]);
}

/** Build a foam from 2D blocks [x, y, 0, mat] (use configs.to2D for flat
 *  configurations). Regions = face-connected same-material clusters (the
 *  engine's phases, same numbering). */
export function fromBlocks(blocks, { g = 1, h = 0.04 } = {}) {
  const F = new Foam({ g, h });
  const { phases, phaseOfBlock } = clusters(blocks, 2);
  for (let p = 1; p < phases.length; p++) F.regions.push({ mat: phases[p].mat, target: phases[p].blocks, parent: p });
  const reg = new Map();
  blocks.forEach((b, i) => reg.set(`${b[0]},${b[1]}`, phaseOfBlock[i]));
  const R = (x, y) => reg.get(`${x},${y}`) ?? 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of blocks) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[0]); y1 = Math.max(y1, b[1]); }
  // unit segments: [ax, ay, bx, by, L, R]
  const segs = [];
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    const c = R(x, y), e = R(x + 1, y), u = R(x, y + 1);
    if (c !== e) segs.push([x + 1, y, x + 1, y + 1, c, e]); // going +y, left = (x, y)
    if (c !== u) segs.push([x, y + 1, x + 1, y + 1, u, c]); // going +x, left = (x, y+1)
  }
  const vkey = (x, y) => `${x},${y}`;
  const inc = new Map();
  segs.forEach((s, i) => { for (const k of [vkey(s[0], s[1]), vkey(s[2], s[3])]) { if (!inc.has(k)) inc.set(k, []); inc.get(k).push(i); } });
  const isJunction = (k) => inc.get(k).length !== 2;
  const used = new Uint8Array(segs.length);
  const pid = new Map();
  const pointOf = (x, y, junction) => {
    const k = vkey(x, y);
    if (junction) { if (!pid.has(k)) { pid.set(k, F.X.length); F.X.push(x); F.Y.push(y); F.isJ.push(true); } return pid.get(k); }
    F.X.push(x); F.Y.push(y); F.isJ.push(false); return F.X.length - 1;
  };
  const trace = (startK, si) => {
    // walk from vertex startK along segment si until a junction (or back to start)
    const [sx, sy] = startK.split(',').map(Number);
    const s0 = segs[si];
    const forward = s0[0] === sx && s0[1] === sy;
    const L = forward ? s0[4] : s0[5], Rr = forward ? s0[5] : s0[4];
    const path = [[sx, sy]];
    let cur = si, vx = sx, vy = sy;
    for (;;) {
      used[cur] = 1;
      const s = segs[cur];
      const [nx, ny] = s[0] === vx && s[1] === vy ? [s[2], s[3]] : [s[0], s[1]];
      path.push([nx, ny]);
      const k = vkey(nx, ny);
      if (isJunction(k) || k === startK) break;
      const nxt = inc.get(k).find((t) => !used[t]);
      if (nxt === undefined) break;
      cur = nxt; vx = nx; vy = ny;
    }
    return { path, L, R: Rr };
  };
  const films = [];
  for (const [k, list] of inc) if (isJunction(k)) for (const si of list) if (!used[si]) films.push({ ...trace(k, si), closed: false });
  for (let si = 0; si < segs.length; si++) if (!used[si]) {
    const s = segs[si];
    const t = trace(vkey(s[0], s[1]), si);
    t.path.pop();
    films.push({ ...t, closed: true });
  }
  for (const f of films) {
    const idx = [];
    const n = f.path.length;
    f.path.forEach(([x, y], i) => {
      const end = !f.closed && (i === 0 || i === n - 1);
      idx.push(pointOf(x, y, end));
    });
    F.films.push({ idx, L: f.L, R: f.R, closed: f.closed });
  }
  F.cleanup();
  F.remesh(h);
  return F;
}
