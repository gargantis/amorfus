// Allocation-free arithmetic DSS recogniser (Debled-Rennesson & Reveillès),
// same semantics as dss.mjs: standard 4-connected digital straight segments,
// extended at either end. All state is small integers held in scalars.
//
// While the path has used only one axis, it is a straight run (a pure
// horizontal or vertical segment); when the second axis first appears the
// quadrant is fixed and the run is re-recognised in that frame from its
// endpoints (O(run length), no stored points).

export class FastDSS {
  constructor(p0x, p0z, p1x, p1z) {
    // every field initialised here so the object keeps one hidden class
    this.sx = 0; this.sz = 0; this.fx = 0; this.fz = 0; this.lx = 0; this.lz = 0; this.n = 0;
    this.has = false; // arithmetic state valid?
    this.a = 0; this.b = 0; this.mu = 0;
    this.ufx = 0; this.ufz = 0; this.ulx = 0; this.ulz = 0; this.lfx = 0; this.lfz = 0; this.llx = 0; this.llz = 0;
    this.s_sx = 0; this.s_sz = 0; this.s_a = 0; this.s_b = 0; this.s_mu = 0; this.s_has = false;
    this.s_ufx = 0; this.s_ufz = 0; this.s_ulx = 0; this.s_ulz = 0; this.s_lfx = 0; this.s_lfz = 0; this.s_llx = 0; this.s_llz = 0;
    this.init(p0x, p0z, p1x, p1z);
  }

  init(p0x, p0z, p1x, p1z) {
    this.sx = p1x - p0x; this.sz = p1z - p0z; // −1, 0, 1 (0 = unknown)
    this.fx = p0x; this.fz = p0z; // first point (original coords)
    this.lx = p1x; this.lz = p1z; // last point
    this.n = 2; // points
    const sx = this.sx || 1, sz = this.sz || 1;
    this._start(sx * p0x, sz * p0z, sx * p1x, sz * p1z);
    return this;
  }

  _tx(x) { return (this.sx || 1) * x; }
  _tz(z) { return (this.sz || 1) * z; }

  /** Start the arithmetic state from the first step (frame fixed). */
  _start(x0, z0, x1, z1) {
    this.has = true;
    if (x1 - x0 === 1) { this.a = 0; this.b = 1; } else { this.a = 1; this.b = 0; }
    this.mu = this.a * x0 - this.b * z0;
    this.ufx = x0; this.ufz = z0; this.ulx = x1; this.ulz = z1;
    this.lfx = x0; this.lfz = z0; this.llx = x1; this.llz = z1;
  }

  _front(mx, mz) {
    const a = this.a, b = this.b, mu = this.mu;
    const r = a * mx - b * mz;
    const top = mu + a + b - 1;
    if (r >= mu && r <= top) {
      if (r === mu) { this.ulx = mx; this.ulz = mz; }
      if (r === top) { this.llx = mx; this.llz = mz; }
      return true;
    }
    if (r === mu - 1) {
      this.ulx = mx; this.ulz = mz;
      this.lfx = this.llx; this.lfz = this.llz;
      this.a = mz - this.ufz;
      this.b = mx - this.ufx;
      this.mu = this.a * mx - this.b * mz;
      return true;
    }
    if (r === top + 1) {
      this.llx = mx; this.llz = mz;
      this.ufx = this.ulx; this.ufz = this.ulz;
      this.a = mz - this.lfz;
      this.b = mx - this.lfx;
      this.mu = this.a * this.ufx - this.b * this.ufz;
      return true;
    }
    return false;
  }

  _back(mx, mz) {
    const a = this.a, b = this.b, mu = this.mu;
    const r = a * mx - b * mz;
    const top = mu + a + b - 1;
    if (r >= mu && r <= top) {
      if (r === mu) { this.ufx = mx; this.ufz = mz; }
      if (r === top) { this.lfx = mx; this.lfz = mz; }
      return true;
    }
    if (r === mu - 1) {
      this.ufx = mx; this.ufz = mz;
      this.llx = this.lfx; this.llz = this.lfz;
      this.a = this.ulz - mz;
      this.b = this.ulx - mx;
      this.mu = this.a * mx - this.b * mz;
      return true;
    }
    if (r === top + 1) {
      this.lfx = mx; this.lfz = mz;
      this.ulx = this.ufx; this.ulz = this.ufz;
      this.a = this.llz - mz;
      this.b = this.llx - mx;
      this.mu = this.a * mx - this.b * mz - (this.a + this.b - 1);
      return true;
    }
    return false;
  }

  _save() {
    this.s_has = this.has;
    this.s_sx = this.sx; this.s_sz = this.sz; this.s_a = this.a; this.s_b = this.b; this.s_mu = this.mu;
    this.s_ufx = this.ufx; this.s_ufz = this.ufz; this.s_ulx = this.ulx; this.s_ulz = this.ulz;
    this.s_lfx = this.lfx; this.s_lfz = this.lfz; this.s_llx = this.llx; this.s_llz = this.llz;
  }
  _restore() {
    this.has = this.s_has;
    this.sx = this.s_sx; this.sz = this.s_sz; this.a = this.s_a; this.b = this.s_b; this.mu = this.s_mu;
    this.ufx = this.s_ufx; this.ufz = this.s_ufz; this.ulx = this.s_ulx; this.ulz = this.s_ulz;
    this.lfx = this.s_lfx; this.lfz = this.s_lfz; this.llx = this.s_llx; this.llz = this.s_llz;
  }

  /** Re-run over the whole path in the (now fixed) frame. The path is a
   *  single-axis run from F to (the point before) the new point, plus the
   *  new point at the front (front = true) or at the back. */
  _rerun(front, mx, mz) {
    // points in order: front ? [P0..Pn-1, M] : [M, P0..Pn-1], P a straight run
    const n = this.n;
    const ux = Math.sign(this.lx - this.fx), uz = Math.sign(this.lz - this.fz);
    const sx = this.sx || 1, sz = this.sz || 1;
    if (front) {
      this._start(sx * this.fx, sz * this.fz, sx * (this.fx + ux), sz * (this.fz + uz));
      for (let k = 2; k < n; k++) if (!this._front(sx * (this.fx + k * ux), sz * (this.fz + k * uz))) return false;
      return this._front(sx * mx, sz * mz);
    }
    this._start(sx * mx, sz * mz, sx * this.fx, sz * this.fz);
    for (let k = 1; k < n; k++) if (!this._front(sx * (this.fx + k * ux), sz * (this.fz + k * uz))) return false;
    return true;
  }

  addFront(mx, mz) {
    const dx = mx - this.lx, dz = mz - this.lz;
    // quadrant check / fix
    let fixes = false;
    if (dx !== 0) { if (this.sx === 0) fixes = true; else if (this.sx !== dx) return false; }
    else { if (this.sz === 0) fixes = true; else if (this.sz !== dz) return false; }
    if (fixes) {
      this._save();
      if (dx !== 0) this.sx = dx; else this.sz = dz;
      if (!this._rerun(true, mx, mz)) { this._restore(); return false; }
      this.lx = mx; this.lz = mz; this.n++;
      return true;
    }
    if (!this.has) this._initRun();
    this._save();
    if (this._front(this._tx(mx), this._tz(mz))) { this.lx = mx; this.lz = mz; this.n++; return true; }
    this._restore();
    return false;
  }

  addBack(mx, mz) {
    const dx = this.fx - mx, dz = this.fz - mz;
    let fixes = false;
    if (dx !== 0) { if (this.sx === 0) fixes = true; else if (this.sx !== dx) return false; }
    else { if (this.sz === 0) fixes = true; else if (this.sz !== dz) return false; }
    if (fixes) {
      this._save();
      if (dx !== 0) this.sx = dx; else this.sz = dz;
      if (!this._rerun(false, mx, mz)) { this._restore(); return false; }
      this.fx = mx; this.fz = mz; this.n++;
      return true;
    }
    if (!this.has) this._initRun();
    this._save();
    if (this._back(this._tx(mx), this._tz(mz))) { this.fx = mx; this.fz = mz; this.n++; return true; }
    this._restore();
    return false;
  }

  /** Arithmetic state of a single-axis run (frame partially unknown). */
  _initRun() {
    // run from F to L along one axis: recognise in the current frame
    const n = this.n;
    const ux = Math.sign(this.lx - this.fx), uz = Math.sign(this.lz - this.fz);
    const sx = this.sx || 1, sz = this.sz || 1;
    this._start(sx * this.fx, sz * this.fz, sx * (this.fx + ux), sz * (this.fz + uz));
    for (let k = 2; k < n; k++) this._front(sx * (this.fx + k * ux), sz * (this.fz + k * uz));
  }

  get length() { return this.n - 1; }

  centerLine() {
    if (!this.has) this._initRun();
    const sx = this.sx || 1, sz = this.sz || 1;
    return { A: this.a * sx, B: -this.b * sz, C: this.mu + (this.a + this.b - 1) / 2 };
  }
}
