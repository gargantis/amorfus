// Arithmetic recognition of standard (4-connected) digital straight
// segments, after Debled-Rennesson & Reveillès (1995), extended at both
// ends. All arithmetic is on small integers, so it is exact and the same
// on every engine.
//
// A path is a sequence of lattice points joined by unit steps E/S/W/N.
// A DSS uses at most one horizontal and one vertical direction. Inside a
// recogniser the path is mapped to the first quadrant (x' = sx·x,
// z' = sz·z) so that every step is (1,0) or (0,1); the segment is then a
// subset of the standard line  mu ≤ a·x' − b·z' ≤ mu + a + b − 1
// (direction (b, a), a, b ≥ 0 coprime: the minimal characteristic).

export class DSS {
  /** Start from one step p0 → p1 (original coordinates). */
  constructor(p0x, p0z, p1x, p1z) {
    const dx = p1x - p0x, dz = p1z - p0z;
    this.sx = dx !== 0 ? dx : 0; // 0 = not yet known
    this.sz = dz !== 0 ? dz : 0;
    this.pts = [p0x, p0z, p1x, p1z]; // original coords, in order (for re-runs)
    this._reset();
  }

  _tx(x) { return (this.sx || 1) * x; }
  _tz(z) { return (this.sz || 1) * z; }

  /** Recompute the arithmetic state from the stored points (used once,
   *  when the second direction first appears). */
  _reset() {
    const p = this.pts;
    const n = p.length / 2;
    const x0 = this._tx(p[0]), z0 = this._tz(p[1]);
    const x1 = this._tx(p[2]), z1 = this._tz(p[3]);
    if (x1 - x0 === 1) { this.a = 0; this.b = 1; } else { this.a = 1; this.b = 0; }
    this.mu = this.a * x0 - this.b * z0;
    this.UF = [x0, z0]; this.UL = [x1, z1]; this.LF = [x0, z0]; this.LL = [x1, z1];
    for (let i = 2; i < n; i++) {
      if (!this._front(this._tx(p[i * 2]), this._tz(p[i * 2 + 1]))) throw new Error('DSS reset failed');
    }
  }

  _front(mx, mz) {
    const { a, b, mu } = this;
    const r = a * mx - b * mz;
    const top = mu + a + b - 1;
    if (r >= mu && r <= top) {
      if (r === mu) this.UL = [mx, mz];
      if (r === top) this.LL = [mx, mz];
      return true;
    }
    if (r === mu - 1) {
      this.UL = [mx, mz];
      this.LF = this.LL;
      this.a = mz - this.UF[1];
      this.b = mx - this.UF[0];
      this.mu = this.a * mx - this.b * mz;
      return true;
    }
    if (r === top + 1) {
      this.LL = [mx, mz];
      this.UF = this.UL;
      this.a = mz - this.LF[1];
      this.b = mx - this.LF[0];
      this.mu = this.a * this.UF[0] - this.b * this.UF[1];
      return true;
    }
    return false;
  }

  _back(mx, mz) {
    const { a, b, mu } = this;
    const r = a * mx - b * mz;
    const top = mu + a + b - 1;
    if (r >= mu && r <= top) {
      if (r === mu) this.UF = [mx, mz];
      if (r === top) this.LF = [mx, mz];
      return true;
    }
    if (r === mu - 1) {
      this.UF = [mx, mz];
      this.LL = this.LF;
      this.a = this.UL[1] - mz;
      this.b = this.UL[0] - mx;
      this.mu = this.a * mx - this.b * mz;
      return true;
    }
    if (r === top + 1) {
      this.LF = [mx, mz];
      this.UL = this.UF;
      this.a = this.LL[1] - mz;
      this.b = this.LL[0] - mx;
      this.mu = this.a * mx - this.b * mz - (this.a + this.b - 1);
      return true;
    }
    return false;
  }

  /** Can the step direction (dx, dz) belong to this segment? Updates the
   *  quadrant if the step introduces the second axis. Returns 0 = no,
   *  1 = yes (same quadrant), 2 = yes and the quadrant was just fixed. */
  _quadrant(dx, dz) {
    if (dx !== 0) {
      if (this.sx === 0) { this.sx = dx; return 2; }
      return this.sx === dx ? 1 : 0;
    }
    if (this.sz === 0) { this.sz = dz; return 2; }
    return this.sz === dz ? 1 : 0;
  }

  /** Append point M after the last point. Returns false (state unchanged)
   *  if the extended path is not a DSS. */
  addFront(mx, mz) {
    const n = this.pts.length;
    const lx = this.pts[n - 2], lz = this.pts[n - 1];
    const q = this._quadrant(mx - lx, mz - lz);
    if (q === 0) return false;
    if (q === 2) {
      // second axis just appeared: re-run in the now-fixed frame
      const save = this._save();
      this.pts.push(mx, mz);
      try { this._reset(); return true; } catch { this.pts.length = n; this._restore(save); return false; }
    }
    const save = this._save();
    if (this._front(this._tx(mx), this._tz(mz))) { this.pts.push(mx, mz); return true; }
    this._restore(save);
    return false;
  }

  /** Prepend point M before the first point. */
  addBack(mx, mz) {
    const fx = this.pts[0], fz = this.pts[1];
    const q = this._quadrant(fx - mx, fz - mz);
    if (q === 0) return false;
    if (q === 2) {
      const save = this._save();
      const old = this.pts.slice();
      this.pts = [mx, mz, ...old];
      try { this._reset(); return true; } catch { this.pts = old; this._restore(save); return false; }
    }
    const save = this._save();
    if (this._back(this._tx(mx), this._tz(mz))) { this.pts.unshift(mx, mz); return true; }
    this._restore(save);
    return false;
  }

  _save() { return [this.sx, this.sz, this.a, this.b, this.mu, this.UF, this.UL, this.LF, this.LL]; }
  _restore(s) { [this.sx, this.sz, this.a, this.b, this.mu, this.UF, this.UL, this.LF, this.LL] = s; }

  get length() { return this.pts.length / 2 - 1; } // steps

  /** Centre line of the digital strip in ORIGINAL coordinates:
   *  A·x + B·z = C, with (A, B) an integer normal (unnormalised). */
  centerLine() {
    const sx = this.sx || 1, sz = this.sz || 1;
    // a·x' − b·z' = mu + (a + b − 1)/2,  x' = sx·x, z' = sz·z
    return { A: this.a * sx, B: -this.b * sz, C: this.mu + (this.a + this.b - 1) / 2 };
  }
}

/** Brute force: is the path (original coords, flat array) a standard DSS?
 *  Returns the minimal (a, b) or null. For tests only. */
export function bruteDSS(pts) {
  const n = pts.length / 2;
  let sx = 0, sz = 0;
  for (let i = 1; i < n; i++) {
    const dx = pts[i * 2] - pts[i * 2 - 2], dz = pts[i * 2 + 1] - pts[i * 2 - 1];
    if (Math.abs(dx) + Math.abs(dz) !== 1) throw new Error('not 4-connected');
    if (dx !== 0) { if (sx !== 0 && sx !== dx) return null; sx = dx; }
    if (dz !== 0) { if (sz !== 0 && sz !== dz) return null; sz = dz; }
  }
  sx = sx || 1; sz = sz || 1;
  const gcd = (u, v) => (v === 0 ? u : gcd(v, u % v));
  let best = null;
  for (let s = 1; s <= 2 * n + 2; s++) {
    for (let a = 0; a <= s; a++) {
      const b = s - a;
      if (gcd(a, b) !== 1) continue;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const r = a * sx * pts[i * 2] - b * sz * pts[i * 2 + 1];
        if (r < lo) lo = r;
        if (r > hi) hi = r;
      }
      if (hi - lo <= a + b - 1) { best = { a, b, mu: lo }; return best; }
    }
  }
  return best;
}
