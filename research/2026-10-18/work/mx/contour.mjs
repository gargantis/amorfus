// mx contour: rasterisation-consistent boundary reconstruction on a small
// categorical image (a surface-followed window around one block).
//
// Every crack (unit edge between two known cells of different material)
// carries a crossing point that may move only along the crack's dual edge
// (centre to centre): x = mid + τ·n, |τ| ≤ τmax < ½, so every cell centre
// keeps its own material. Cracks link into chains through lattice points:
// 2 cracks pass through or turn; a 2-material diagonal saddle connects the
// pair chosen by xBR's weighted-distance rule (tie: pinned point); 3-way and
// other 4-way points are pinned (the lattice point is a fixed vertex).
// A turn between two runs both ≥ cornerRun cracks is a corner (fixed
// vertex). Between fixed vertices, τ of each crack comes from a weighted
// total-least-squares line (or parabola) fitted to the raw crack midpoints
// within ±r cracks along the chain. The boundary is the polyline through
// the crossing points and fixed vertices; the centre cell's share of it is
// returned as segments with the material on each side.
export const U = 15;

export const STATS = { calls: 0, fits: 0, cracks: 0, centreCracks: 0 };
export function reconstruct(img, S, opts = {}) {
  STATS.calls++;
  const tauMax = opts.tauMax ?? 0.45;
  const r = opts.r ?? 6;
  const cornerRun = opts.cornerRun ?? 3;
  const quad = opts.quad ?? false;
  const at = (i, j) => (i < 0 || j < 0 || i >= S || j >= S ? U : img[j * S + i]);
  // ---- cracks: id = kind*S*S + j*S + i. kind 0 = H(i,j): cells (i,j−1)|(i,j),
  // from lattice (i,j) to (i+1,j), n = (0,1). kind 1 = V(i,j): (i−1,j)|(i,j),
  // from (i,j) to (i,j+1), n = (1,0).
  const NC = 2 * S * S;
  const exists = new Uint8Array(NC);
  const lowM = new Int8Array(NC), highM = new Int8Array(NC);
  for (let j = 1; j < S; j++) for (let i = 0; i < S; i++) {
    const p = at(i, j - 1), q = at(i, j);
    if (p !== U && q !== U && p !== q) { const id = j * S + i; exists[id] = 1; lowM[id] = p; highM[id] = q; }
  }
  for (let j = 0; j < S; j++) for (let i = 1; i < S; i++) {
    const p = at(i - 1, j), q = at(i, j);
    if (p !== U && q !== U && p !== q) { const id = S * S + j * S + i; exists[id] = 1; lowM[id] = p; highM[id] = q; }
  }
  const H = (i, j) => (i >= 0 && i < S && j >= 1 && j < S && exists[j * S + i] ? j * S + i : -1);
  const Vc = (i, j) => (i >= 1 && i < S && j >= 0 && j < S && exists[S * S + j * S + i] ? S * S + j * S + i : -1);
  const kindOf = (id) => (id >= S * S ? 1 : 0);
  const midOf = (id) => {
    const k = kindOf(id), rem = id - k * S * S, j = (rem / S) | 0, i = rem - j * S;
    return k === 0 ? [i + 0.5, j] : [i, j + 0.5];
  };
  // endpoint e (0/1) lattice point of a crack
  const endPt = (id, e) => {
    const k = kindOf(id), rem = id - k * S * S, j = (rem / S) | 0, i = rem - j * S;
    return k === 0 ? [i + e, j] : [i, j + e];
  };
  // ---- links at lattice points: link[id*2+e] = other crack*2+end, or −1 open, −2 pinned
  const link = new Int32Array(NC * 2).fill(-1);
  const pinned = new Map(); // id*2+e → lattice point
  const df = (p, q) => (p === q ? 0 : 1);
  for (let y = 0; y <= S; y++) for (let x = 0; x <= S; x++) {
    const N = Vc(x, y - 1), So = Vc(x, y), W = H(x - 1, y), E = H(x, y);
    // ends: N's end 1 (lower end at (x,y)), So's end 0, W's end 1, E's end 0
    const list = [];
    if (N >= 0) list.push(N * 2 + 1);
    if (So >= 0) list.push(So * 2);
    if (W >= 0) list.push(W * 2 + 1);
    if (E >= 0) list.push(E * 2);
    if (list.length === 0) continue;
    if (list.length === 1) continue; // open (border or unknown beyond)
    if (list.length === 2) {
      link[list[0]] = list[1];
      link[list[1]] = list[0];
      continue;
    }
    if (list.length === 4) {
      const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x - 1, y), d = at(x, y);
      if (a === d && b === c && a !== b) {
        // xBR weighted distances around the point (e = a, corner BR)
        const wd1 = df(a, at(x, y - 2)) + df(a, at(x - 2, y)) + df(d, at(x - 1, y + 1)) + df(d, at(x + 1, y - 1));
        const wd2 = df(c, at(x - 2, y - 1)) + df(c, at(x, y + 1)) + df(b, at(x + 1, y)) + df(b, at(x - 1, y - 2));
        const nE = N * 2 + 1, sE = So * 2, wE = W * 2 + 1, eE = E * 2;
        const mg = opts.saddleMargin ?? 1, smin = opts.saddleMin ?? 0;
        if (wd1 - wd2 >= mg && wd1 >= smin) { // connect a–d: b's corner (N,E) and c's corner (W,S)
          link[nE] = eE; link[eE] = nE; link[wE] = sE; link[sE] = wE; continue;
        }
        if (wd2 - wd1 >= mg && wd2 >= smin) { // connect b–c: a's corner (N,W) and d's corner (E,S)
          link[nE] = wE; link[wE] = nE; link[eE] = sE; link[sE] = eE; continue;
        }
        if ((mg > 1 || smin > 0) && wd1 !== wd2) { for (const k of list) { link[k] = -2; pinned.set(k, [x, y]); } continue; }
        if (opts.tieBreak) {
          // tie: connect the minority material of the 4×4 around the point
          // (sparse strokes stay connected), then the lower id
          let na = 0, nb = 0;
          for (let yy = y - 2; yy < y + 2; yy++) for (let xx = x - 2; xx < x + 2; xx++) { const v = at(xx, yy); if (v === a) na++; else if (v === b) nb++; }
          const minority = na < nb || (na === nb && a < b);
          const connectAD = opts.tieBreak === 'majority' ? !minority : minority;
          if (connectAD) { link[nE] = eE; link[eE] = nE; link[wE] = sE; link[sE] = wE; }
          else { link[nE] = wE; link[wE] = nE; link[eE] = sE; link[sE] = eE; }
          continue;
        }
      }
    }
    for (const k of list) { link[k] = -2; pinned.set(k, [x, y]); }
  }
  // ---- chains
  const seen = new Uint8Array(NC);
  const chains = [];
  const walk = (startEnd) => {
    // startEnd = id*2+e: start at crack id entering through end e
    const cr = [], dir = [];
    let cur = startEnd;
    let closed = false;
    for (;;) {
      const id = cur >> 1, e = cur & 1;
      if (seen[id]) { closed = true; break; }
      seen[id] = 1;
      cr.push(id);
      dir.push(e); // traversed from end e to end 1−e
      const out = id * 2 + (1 - e);
      const nx = link[out];
      if (nx < 0) break;
      cur = nx;
    }
    return { cr, dir, closed, head: startEnd, tail: cr.length ? cr[cr.length - 1] * 2 + (1 - dir[dir.length - 1]) : -1 };
  };
  for (let id = 0; id < NC; id++) {
    if (!exists[id] || seen[id]) continue;
    for (let e = 0; e < 2; e++) {
      if (link[id * 2 + e] < 0) { chains.push(walk(id * 2 + e)); break; }
    }
  }
  for (let id = 0; id < NC; id++) if (exists[id] && !seen[id]) chains.push(walk(id * 2));
  // ---- per chain: runs, corners, crossing positions, polyline
  const segs = [];
  const cx0 = (S - 1) / 2, cy0 = (S - 1) / 2; // centre cell [cx0, cx0+1]²
  const est = opts.est ?? 'mlaa';
  for (const ch of chains) {
    const n = ch.cr.length;
    if (n === 0) continue;
    if (opts.loneDisc && ch.closed && n === 4) {
      // a lone block: inscribed disc (only the centre cell can be the block)
      const id = ch.cr[0];
      const inside = (lowM[id] === at(cx0, cy0) && highM[id] !== at(cx0, cy0)) || (highM[id] === at(cx0, cy0) && lowM[id] !== at(cx0, cy0));
      // is this loop around the centre cell? its 4 cracks are the centre cell's edges
      const k0 = kindOf(id), [mx, my] = midOf(id);
      const aroundCentre = (k0 === 0 && Math.abs(mx - (cx0 + 0.5)) < 1e-9 && (my === cy0 || my === cy0 + 1)) || (k0 === 1 && Math.abs(my - (cy0 + 0.5)) < 1e-9 && (mx === cx0 || mx === cx0 + 1));
      if (aroundCentre && inside) segs.push({ lone: true, other: lowM[id] === at(cx0, cy0) ? highM[id] : lowM[id] });
      continue;
    }
    const kinds = ch.cr.map(kindOf);
    // traversal direction of each crack (unit lattice step)
    const dirv = ch.cr.map((id, k) => { const a = endPt(id, ch.dir[k]), b = endPt(id, 1 - ch.dir[k]); return [b[0] - a[0], b[1] - a[1]]; });
    // runs: maximal stretches with the same direction
    const runs = []; // {s, e (inclusive), len, kind, d}
    for (let k = 0; k < n; k++) {
      const last = runs[runs.length - 1];
      if (last && last.d[0] === dirv[k][0] && last.d[1] === dirv[k][1]) { last.e = k; last.len++; } else runs.push({ s: k, e: k, len: 1, kind: kinds[k], d: dirv[k] });
    }
    let closedMerge = false;
    if (ch.closed && runs.length > 1) {
      const f = runs[0], l = runs[runs.length - 1];
      if (f.d[0] === l.d[0] && f.d[1] === l.d[1]) { closedMerge = true; const L = f.len + l.len; f.len = L; l.len = L; }
    }
    const R = runs.length;
    const rAt = (i) => (ch.closed ? runs[((i % R) + R) % R] : runs[i]);
    const hasR = (i) => ch.closed ? R > 1 : i >= 0 && i < R;
    const anti = (p, q) => p.d[0] === -q.d[0] && p.d[1] === -q.d[1];
    // corner between run i and run i+1
    const cornerAfter = new Uint8Array(R);
    for (let i = 0; i < R; i++) {
      if (!hasR(i + 1)) continue;
      const A = runs[i], B = rAt(i + 1);
      if (A === B) continue;
      if (A.len >= cornerRun && B.len >= cornerRun) cornerAfter[i] = 1;
    }
    // a lone block (closed loop of 4 cracks) keeps its corners
    if (opts.loneSquare !== false && ch.closed && n <= 4) for (let i = 0; i < R; i++) cornerAfter[i] = 1;
    // a chain made only of one cell's edges (a block isolated in its
    // 4-neighbourhood whose corners are pinned, e.g. a checker's rim) stays square
    let oneCell = false;
    if (opts.cellChain && n <= 4) {
      const cellsOf = (id) => {
        const k = kindOf(id), rem = id - k * S * S, j = (rem / S) | 0, i = rem - j * S;
        return k === 0 ? [j * S + i, (j - 1) * S + i] : [j * S + i, j * S + i - 1];
      };
      let common = cellsOf(ch.cr[0]);
      for (let k = 1; k < n; k++) { const cs = cellsOf(ch.cr[k]); common = common.filter((c) => cs.includes(c)); }
      if (common.length > 0) { oneCell = true; for (let i = 0; i < R; i++) cornerAfter[i] = 1; }
    }
    // caps: a short run between two long antiparallel runs (a finger end) keeps both its turns
    for (let i = 0; i < R; i++) {
      const B = runs[i];
      if (B.len >= cornerRun || !hasR(i - 1) || !hasR(i + 1)) continue;
      const A = rAt(i - 1), C = rAt(i + 1);
      if (A === B || C === B) continue;
      if (anti(A, C) && Math.min(A.len, C.len) >= (opts.capSide ?? cornerRun)) { cornerAfter[i] = 1; const ip = ch.closed ? (i - 1 + R) % R : i - 1; cornerAfter[ip] = 1; }
    }
    const mids = ch.cr.map(midOf);
    const tau = new Float64Array(n);
    const nOf = (k) => (kinds[k] === 0 ? [0, 1] : [1, 0]);
    // τ of crack k so that its crossing lies on the segment P→Q
    const tauOnSeg = (k, P, Q) => {
      const [mx, my] = mids[k], nk = nOf(k);
      const tx = Q[0] - P[0], ty = Q[1] - P[1];
      const cr = nk[0] * ty - nk[1] * tx;
      if (Math.abs(cr) < 1e-9) return 0;
      return -((mx - P[0]) * ty - (my - P[1]) * tx) / cr;
    };
    const turnPt = (k) => endPt(ch.cr[k], ch.dir[k]); // lattice point where crack k starts
    if (est === 'mlaa') {
      // vertices: riser midpoints (runs of 1); long runs interpolate between
      // their end vertices (Z), or tent through their middle on the crack
      // line (U, an extremum), or end at a corner / chain end.
      for (let i = 0; i < R; i++) {
        const B = runs[i];
        if (B.len === 1 && !(ch.closed && closedMerge && (i === 0 || i === R - 1))) { tau[B.s] = 0; continue; }
        const prevCorner = hasR(i - 1) ? cornerAfter[ch.closed ? (i - 1 + R) % R : i - 1] : 0;
        const nextCorner = hasR(i + 1) ? cornerAfter[i] : 0;
        const A = hasR(i - 1) ? rAt(i - 1) : null, C = hasR(i + 1) ? rAt(i + 1) : null;
        // start vertex
        let P, Q;
        const firstMid = mids[B.s], lastMid = mids[B.e];
        const bd = B.d;
        if (!A || A === B) P = [firstMid[0] - 0.5 * bd[0], firstMid[1] - 0.5 * bd[1]];
        else if (prevCorner) P = turnPt(B.s);
        else if (A.len === 1) P = mids[A.e];
        else P = [firstMid[0], firstMid[1]]; // long–long turn: chamfer through the end cracks
        if (!C || C === B) Q = [lastMid[0] + 0.5 * bd[0], lastMid[1] + 0.5 * bd[1]];
        else if (nextCorner) Q = endPt(ch.cr[B.e], 1 - ch.dir[B.e]);
        else if (C.len === 1) Q = mids[C.s];
        else Q = [lastMid[0], lastMid[1]];
        const isU = A && C && A !== B && C !== B && anti(A, C) && !prevCorner && !nextCorner;
        // closed merged run spans the wrap: handle as plain interpolation
        const idx = [];
        if (B.s <= B.e) for (let k = B.s; k <= B.e; k++) idx.push(k);
        if (isU) {
          const mid = (B.len - 1) / 2;
          const apex = [ (firstMid[0] + lastMid[0]) / 2, (firstMid[1] + lastMid[1]) / 2 ];
          for (let t = 0; t < idx.length; t++) tau[idx[t]] = t <= mid ? tauOnSeg(idx[t], P, apex) : tauOnSeg(idx[t], apex, Q);
        } else for (const k of idx) tau[k] = tauOnSeg(k, P, Q);
      }
    } else {
      // weighted TLS fit over a DSS-like window of whole runs around the crack
      const runOf = new Int32Array(n);
      runs.forEach((ru, i) => { for (let k = ru.s; k <= ru.e; k++) runOf[k] = i; });
      for (let k = 0; k < n; k++) {
        const i0 = runOf[k];
        let lo = i0, hi = i0;
        const isDss = (a, b) => {
          // minority orientation all 1, majority within {m, m+1}; ≤ 2 directions
          const ds = new Set();
          const lens = [[], []];
          for (let i = a; i <= b; i++) { const ru = runs[i]; ds.add(`${ru.d[0]},${ru.d[1]}`); if (i > a && i < b) lens[ru.kind].push(ru.len); }
          if (ds.size > 2) return false;
          const ok = (L) => L.length === 0 || Math.max(...L) - Math.min(...L) <= 1;
          const ones = (L) => L.every((v) => v === 1);
          return (ones(lens[0]) && ok(lens[1])) || (ones(lens[1]) && ok(lens[0]));
        };
        const stop = (i) => i < 0 || i >= R;
        for (let m = 1; m <= (opts.maxRuns ?? 12); m++) {
          const a = i0 - m, b = i0 + m;
          if (stop(a) || stop(b) || cornerAfter[a] || cornerAfter[b - 1]) break;
          if (!isDss(a, b)) break;
          lo = a; hi = b;
        }
        const pts = [];
        for (let i = lo; i <= hi; i++) for (let m = runs[i].s; m <= runs[i].e; m++) pts.push(mids[m]);
        if (pts.length < 3) { tau[k] = 0; continue; }
        let mx = 0, my = 0;
        for (const [x, y] of pts) { mx += x; my += y; }
        mx /= pts.length; my /= pts.length;
        let sxx = 0, syy = 0, sxy = 0;
        for (const [x, y] of pts) { const dx = x - mx, dy = y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
        const [tx0, ty0] = principalDir(sxx, syy, sxy);
        tau[k] = tauOnSeg(k, [mx, my], [mx + tx0, my + ty0]);
      }
    }
    if (est === 'quad' || est === 'hybrid') {
      const runOf = new Int32Array(n);
      runs.forEach((ru, i) => { for (let k = ru.s; k <= ru.e; k++) runOf[k] = i; });
      // arc bounds per crack (between corners), wrapping for corner-free loops
      const cornerBefore = (k) => k > 0 && runOf[k] !== runOf[k - 1] && cornerAfter[runOf[k - 1]];
      const anyCorner = cornerAfter.some((v) => v);
      const wrap = ch.closed && !anyCorner;
      const hq = opts.hq ?? 6;
      const isDss = (a, b) => {
        const ds = new Set();
        const lens = [[], []];
        for (let i = a; i <= b; i++) { const ru = runs[i]; ds.add(ru.d[0] * 3 + ru.d[1]); if (i > a && i < b) lens[ru.kind].push(ru.len); }
        if (ds.size > 2) return false;
        const ok = (L) => L.length === 0 || Math.max(...L) - Math.min(...L) <= 1;
        const ones = (L) => L.every((v) => v === 1);
        return (ones(lens[0]) && ok(lens[1])) || (ones(lens[1]) && ok(lens[0]));
      };
      for (let k = 0; k < n; k++) {
        STATS.fits++;
        let pts = null;
        let useLine = false;
        if (est === 'hybrid' && !wrap) {
          const i0 = runOf[k];
          let lo = i0, hi = i0;
          for (let m = 1; m <= (opts.maxRuns ?? 16); m++) {
            const a = i0 - m, b = i0 + m;
            if (a < 0 || b >= R || cornerAfter[a] || cornerAfter[b - 1]) break;
            if (!isDss(a, b)) break;
            lo = a; hi = b;
          }
          let cnt = 0;
          for (let i = lo; i <= hi; i++) cnt += runs[i].len;
          if (cnt >= (opts.minLine ?? 9) && (hi - lo >= 2 || (opts.longRun && lo === hi))) {
            pts = [];
            for (let i = lo; i <= hi; i++) for (let mm = runs[i].s; mm <= runs[i].e; mm++) pts.push([...mids[mm], 1]);
            useLine = true;
          }
        }
        if (!pts) {
          pts = [];
          for (let o = -hq; o <= hq; o++) {
            let m = k + o;
            if (wrap) { if (Math.abs(o) * 2 >= n) continue; m = ((m % n) + n) % n; }
            else {
              if (m < 0 || m >= n) continue;
              // stop at corners between k and m
              let blocked = false;
              if (o > 0) { for (let q = k + 1; q <= m; q++) if (cornerBefore(q)) { blocked = true; break; } }
              else for (let q = m + 1; q <= k; q++) if (cornerBefore(q)) { blocked = true; break; }
              if (blocked) continue;
            }
            pts.push([...mids[m], 1 - Math.abs(o) / (hq + 1)]);
          }
        }
        if (pts.length < 3) { tau[k] = 0; continue; }
        let sw = 0, mx = 0, my = 0;
        for (const [x, y, w] of pts) { sw += w; mx += w * x; my += w * y; }
        mx /= sw; my /= sw;
        let sxx = 0, syy = 0, sxy = 0;
        for (const [x, y, w] of pts) { const dx = x - mx, dy = y - my; sxx += w * dx * dx; syy += w * dy * dy; sxy += w * dx * dy; }
        const [tx, ty] = principalDir(sxx, syy, sxy);
        const nxl = -ty, nyl = tx;
        let c0 = 0, c1 = 0, c2 = 0;
        if (!useLine && pts.length >= 5) {
          const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bv = [0, 0, 0];
          for (const [x, y, w] of pts) {
            const u = (x - mx) * tx + (y - my) * ty, v = (x - mx) * nxl + (y - my) * nyl;
            const f = [1, u, u * u];
            for (let p2 = 0; p2 < 3; p2++) { bv[p2] += w * f[p2] * v; for (let q = 0; q < 3; q++) A[p2][q] += w * f[p2] * f[q]; }
          }
          const sol = solve3(A, bv);
          if (sol) [c0, c1, c2] = sol;
        }
        const [mxk, myk] = mids[k], nk = nOf(k);
        let t = 0;
        const dvdt = nk[0] * nxl + nk[1] * nyl, dudt = nk[0] * tx + nk[1] * ty;
        for (let it = 0; it < 6; it++) {
          const px = mxk + t * nk[0], py = myk + t * nk[1];
          const u = (px - mx) * tx + (py - my) * ty, v = (px - mx) * nxl + (py - my) * nyl;
          const g = v - (c0 + c1 * u + c2 * u * u);
          const dg = dvdt - (c1 + 2 * c2 * u) * dudt;
          if (Math.abs(dg) < 1e-6) break;
          t -= g / dg;
        }
        tau[k] = t;
      }
    }
    if (est === 'spline') {
      // vertex list with fixed points (pins, corners) and variable crossings
      const runIdx0 = new Int32Array(n);
      runs.forEach((ru, i) => { for (let k = ru.s; k <= ru.e; k++) runIdx0[k] = i; });
      const verts = []; // {k: crack index or -1, p: fixed point}
      if (!ch.closed && pinned.has(ch.head)) verts.push({ k: -1, p: pinned.get(ch.head) });
      for (let k = 0; k < n; k++) {
        if (k > 0 && runIdx0[k] !== runIdx0[k - 1] && cornerAfter[runIdx0[k - 1]]) verts.push({ k: -1, p: turnPt(k) });
        verts.push({ k, p: null });
      }
      let cyclic = false;
      if (ch.closed) {
        if (R > 1 && cornerAfter[R - 1] && runIdx0[n - 1] !== runIdx0[0]) verts.push({ k: -1, p: turnPt(0) });
        const fi = verts.findIndex((v) => v.k < 0);
        if (fi < 0) cyclic = true;
        else { const rot = verts.splice(0, fi); verts.push(...rot); verts.push(verts[0]); }
      } else if (pinned.has(ch.tail)) verts.push({ k: -1, p: pinned.get(ch.tail) });
      // arcs between fixed vertices (fixed endpoints shared)
      const arcs = [];
      if (cyclic) arcs.push({ vs: verts, cyclic: true });
      else {
        let cur = [];
        for (const v of verts) { cur.push(v); if (v.k < 0 && cur.length > 1) { arcs.push({ vs: cur, cyclic: false }); cur = [v]; } }
        if (cur.length > 1 || (cur.length === 1 && cur[0].k >= 0)) arcs.push({ vs: cur, cyclic: false });
      }
      const w = opts.w ?? 0.05;
      for (const arc of arcs) {
        const vs = arc.vs;
        const varIdx = new Map();
        const vars = [];
        vs.forEach((v) => { if (v.k >= 0 && !varIdx.has(v.k)) { varIdx.set(v.k, vars.length); vars.push(v.k); } });
        const m = vars.length;
        if (m === 0) continue;
        const L = vs.length;
        const triples = [];
        if (arc.cyclic) { for (let i = 0; i < L; i++) triples.push([(i - 1 + L) % L, i, (i + 1) % L]); }
        else for (let i = 1; i + 1 < L; i++) triples.push([i - 1, i, i + 1]);
        const M = Array.from({ length: m }, () => new Float64Array(m));
        const b = new Float64Array(m);
        const cf = [1, -2, 1];
        for (const t of triples) {
          let Dx = 0, Dy = 0;
          const ent = [];
          for (let q = 0; q < 3; q++) {
            const v = vs[t[q]];
            if (v.k < 0) { Dx += cf[q] * v.p[0]; Dy += cf[q] * v.p[1]; }
            else { const mm = mids[v.k]; Dx += cf[q] * mm[0]; Dy += cf[q] * mm[1]; ent.push([varIdx.get(v.k), cf[q], nOf(v.k)]); }
          }
          for (const [j, aj, nj] of ent) {
            b[j] += aj * (Dx * nj[0] + Dy * nj[1]);
            for (const [k2, ak, nk2] of ent) M[j][k2] += aj * ak * (nj[0] * nk2[0] + nj[1] * nk2[1]);
          }
        }
        for (let j = 0; j < m; j++) M[j][j] += w;
        // active-set clamping
        const fixedV = new Map();
        for (let round = 0; round < 6; round++) {
          const free = [];
          for (let j = 0; j < m; j++) if (!fixedV.has(j)) free.push(j);
          const F = free.length;
          const A = Array.from({ length: F }, () => new Float64Array(F + 1));
          for (let a = 0; a < F; a++) {
            const j = free[a];
            let rhs = -b[j];
            for (const [k2, val] of fixedV) rhs -= M[j][k2] * val;
            for (let c = 0; c < F; c++) A[a][c] = M[j][free[c]];
            A[a][F] = rhs;
          }
          const sol = gaussSolve(A, F);
          let changed = false;
          for (let a = 0; a < F; a++) {
            let v = sol ? sol[a] : 0;
            if (v > tauMax) { fixedV.set(free[a], tauMax); changed = true; } else if (v < -tauMax) { fixedV.set(free[a], -tauMax); changed = true; }
            tau[vars[free[a]]] = v;
          }
          for (const [j, val] of fixedV) tau[vars[j]] = val;
          if (!changed) break;
        }
      }
    }
    for (let k = 0; k < n; k++) tau[k] = oneCell ? 0 : Math.max(-tauMax, Math.min(tauMax, tau[k]));
    if (opts.debug) for (let k = 0; k < n; k++) opts.debug.push({ mid: mids[k], n: nOf(k), tau: tau[k] });
    // left material: chain traverses crack k from end dir[k] to 1−dir[k]
    const id0 = ch.cr[0];
    const t0 = dirv[0];
    const n0 = nOf(0);
    const leftIsHigh = -t0[1] * n0[0] + t0[0] * n0[1] > 0;
    const left = leftIsHigh ? highM[id0] : lowM[id0];
    const right = leftIsHigh ? lowM[id0] : highM[id0];
    // polyline vertices: crossings, plus corner points and pins
    const runIdx = new Int32Array(n);
    runs.forEach((ru, i) => { for (let k = ru.s; k <= ru.e; k++) runIdx[k] = i; });
    const poly = [];
    if (!ch.closed && pinned.has(ch.head)) poly.push(pinned.get(ch.head));
    for (let k = 0; k < n; k++) {
      if (k > 0 && runIdx[k] !== runIdx[k - 1] && cornerAfter[runIdx[k - 1]]) poly.push(turnPt(k));
      const [mx, my] = mids[k], nk = nOf(k);
      poly.push([mx + tau[k] * nk[0], my + tau[k] * nk[1]]);
    }
    if (ch.closed) {
      if (R > 1 && cornerAfter[R - 1] && runIdx[n - 1] !== runIdx[0]) poly.push(turnPt(0));
      poly.push(poly[0]);
    } else if (pinned.has(ch.tail)) poly.push(pinned.get(ch.tail));
    // U-shaped long runs: add the apex so the tent is kept between crossings
    // (crossings already sit on the tent; the apex lies between two of them)
    // clip to the centre cell
    for (let k = 0; k + 1 < poly.length; k++) {
      const c = clip(poly[k], poly[k + 1], cx0, cy0, cx0 + 1, cy0 + 1);
      if (c) segs.push([c[0] - cx0, c[1] - cy0, c[2] - cx0, c[3] - cy0, left, right]);
    }
  }
  return segs;
}

/** Unit principal direction of [[sxx, sxy], [sxy, syy]] using only
 *  + − × ÷ √ (golden-safe), x-component kept ≥ 0. */
export function principalDir(sxx, syy, sxy) {
  const h = (sxx - syy) / 2;
  const l = (sxx + syy) / 2 + Math.sqrt(h * h + sxy * sxy);
  let x, y;
  if (sxx >= syy) { x = l - syy; y = sxy; } else { x = sxy; y = l - sxx; }
  const n = Math.sqrt(x * x + y * y);
  if (n < 1e-12) return [1, 0];
  x /= n; y /= n;
  if (x < 0 || (x === 0 && y < 0)) { x = -x; y = -y; }
  return [x, y];
}

function gaussSolve(A, n) {
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    if (p !== c) { const t = A[c]; A[c] = A[p]; A[p] = t; }
    const piv = A[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / piv;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let v = A[r][n];
    for (let k = r + 1; k < n; k++) v -= A[r][k] * x[k];
    x[r] = v / A[r][r];
  }
  return x;
}

function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/** Liang–Barsky clip of segment p→q to the box; null if outside. */
function clip(p, q, x0, y0, x1, y1) {
  const m = 1e-9;
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const P = [-dx, dx, -dy, dy];
  const Q = [p[0] - (x0 - m), x1 + m - p[0], p[1] - (y0 - m), y1 + m - p[1]];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return null; continue; }
    const t = Q[i] / P[i];
    if (P[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  if (t1 - t0 < 1e-12) return null;
  return [p[0] + t0 * dx, p[1] + t0 * dy, p[0] + t1 * dx, p[1] + t1 * dy];
}

/** Material at (fx, fy) in the centre cell: walk from the cell centre to the
 *  point, switching material at every boundary segment crossed (in order). */
export function evalSegments(segs, e, fx, fy) {
  if (segs.length === 0) return e;
  if (segs[0].lone) return (fx - 0.5) ** 2 + (fy - 0.5) ** 2 < 0.25 ? e : segs[0].other;
  const hits = [];
  const ax = 0.5, ay = 0.5, bx = fx, by = fy;
  for (const s of segs) {
    const [x0, y0, x1, y1, L, R] = s;
    const d1x = bx - ax, d1y = by - ay, d2x = x1 - x0, d2y = y1 - y0;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((x0 - ax) * d2y - (y0 - ay) * d2x) / den;
    const u = ((x0 - ax) * d1y - (y0 - ay) * d1x) / den;
    if (t <= 0 || t > 1 || u < 0 || u > 1) continue;
    hits.push([t, L, R]);
  }
  if (hits.length === 0) return e;
  hits.sort((p, q) => p[0] - q[0]);
  let m = e;
  for (const [, L, R] of hits) { if (m === L) m = R; else if (m === R) m = L; }
  return m;
}

// ---------------------------------------------------------------- GPU code
// Per (surface block, direction) code: each passage of a boundary chain
// through the cell becomes one chord between its entry and exit points on
// the cell edge; endpoints are quantised per edge coordinate to 1/Q (both
// cells sharing an edge quantise the same value), plus the material on the
// far side of the chord from the cell centre. Two chords fit one u32:
// 2 × (6 + 6 + 3) bits + 2-bit count.
const Q = 16;
function perim(x, y) { // point on the unit-square boundary → [edge, coord]
  const e = 1e-6;
  if (y <= e) return [0, x];
  if (x >= 1 - e) return [1, y];
  if (y >= 1 - e) return [2, x];
  return [3, y];
}
const ptOf = (edge, q) => (edge === 0 ? [q / Q, 0] : edge === 1 ? [1, q / Q] : edge === 2 ? [q / Q, 1] : [0, q / Q]);
export function encodeChords(segs, e, midPoints = false) {
  if (segs.length && segs[0].lone) return { chords: [], lone: segs[0].other, overflow: false, total: 0 };
  // group consecutive connected segments into passages
  const passes = [];
  let cur = null;
  const onEdge = (x0, y0, x1, y1) => {
    const e = 1e-6;
    return (Math.abs(x0) < e && Math.abs(x1) < e) || (Math.abs(x0 - 1) < e && Math.abs(x1 - 1) < e) ||
      (Math.abs(y0) < e && Math.abs(y1) < e) || (Math.abs(y0 - 1) < e && Math.abs(y1 - 1) < e);
  };
  for (const sg of segs) {
    const [x0, y0, x1, y1, L, R] = sg;
    if (onEdge(x0, y0, x1, y1)) { cur = null; continue; } // runs along the cell edge: no split
    if (cur && Math.abs(cur.end[0] - x0) < 1e-7 && Math.abs(cur.end[1] - y0) < 1e-7 && cur.L === L && cur.R === R) { cur.end = [x1, y1]; cur.pts.push([x1, y1]); cur.n++; continue; }
    cur = { start: [x0, y0], end: [x1, y1], L, R, n: 1, pts: [[x0, y0], [x1, y1]] };
    passes.push(cur);
  }
  const chords = [];
  for (const p of passes) {
    const [ea, ca] = perim(...p.start), [eb, cb] = perim(...p.end);
    const qa = Math.round(ca * Q), qb = Math.round(cb * Q);
    const A = ptOf(ea, qa), B = ptOf(eb, qb);
    if (Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) < 1e-9) continue;
    let M = null;
    if (midPoints) {
      // farthest interior polyline vertex from the chord, quantised to 1/32
      let best = 0.02;
      const dx = B[0] - A[0], dy = B[1] - A[1], dl = Math.hypot(dx, dy);
      for (const q of p.pts) {
        const d = Math.abs(dx * (q[1] - A[1]) - dy * (q[0] - A[0])) / dl;
        if (d > best) { best = d; M = [Math.round(q[0] * 32) / 32, Math.round(q[1] * 32) / 32]; }
      }
    }
    // the passage separates the centre's material e from `far`
    let far;
    if (p.L === e) far = p.R; else if (p.R === e) far = p.L;
    else {
      const cr = (B[0] - A[0]) * (0.5 - A[1]) - (B[1] - A[1]) * (0.5 - A[0]);
      far = cr > 0 ? p.R : p.L;
    }
    if (far === e) continue;
    chords.push({ A, B, M, far, len: Math.hypot(B[0] - A[0], B[1] - A[1]) });
  }
  const overflow = chords.length > 2;
  // keep the two chords cutting the most area (approx: farthest from the centre is least important)
  chords.sort((p, q) => distC(p) - distC(q));
  return { chords: chords.slice(0, 2), overflow, total: chords.length };
}
const distC = (c) => {
  const dx = c.B[0] - c.A[0], dy = c.B[1] - c.A[1];
  return Math.abs(dx * (0.5 - c.A[1]) - dy * (0.5 - c.A[0])) / (Math.hypot(dx, dy) || 1);
};
/** Fragment side: material at (fx, fy) for chord code (the GPU version
 *  tests ≤ 2 lines; nested chords: the one farther from the centre wins). */
export function evalChords(code, e, fx, fy) {
  if (code.lone !== undefined) return (fx - 0.5) ** 2 + (fy - 0.5) ** 2 < 0.25 ? e : code.lone;
  return evalPolyChords(code, e, fx, fy);
  let m = e, best = -1;
  for (const c of code.chords) {
    const dx = c.B[0] - c.A[0], dy = c.B[1] - c.A[1];
    const sP = dx * (fy - c.A[1]) - dy * (fx - c.A[0]);
    const sC = dx * (0.5 - c.A[1]) - dy * (0.5 - c.A[0]);
    if (sP * sC < 0) { // p on the far side
      const d = Math.abs(sC);
      if (d > best) { best = d; m = c.far; }
    }
  }
  return m;
}

/** Passages with an interior point: crossing parity of the path centre → p
 *  against the 2-segment polylines A–M–B; each crossing of a passage
 *  toggles between e and its far material. */
function evalPolyChords(code, e, fx, fy) {
  const hits = [];
  for (const c of code.chords) {
    const pts = c.M ? [c.A, c.M, c.B] : [c.A, c.B];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      const d1x = fx - 0.5, d1y = fy - 0.5, d2x = x1 - x0, d2y = y1 - y0;
      const den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((x0 - 0.5) * d2y - (y0 - 0.5) * d2x) / den;
      const u = ((x0 - 0.5) * d1y - (y0 - 0.5) * d1x) / den;
      if (t <= 0 || t > 1 || u < 0 || u > 1) continue;
      hits.push([t, c.far]);
    }
  }
  if (!hits.length) return e;
  hits.sort((a, b) => a[0] - b[0]);
  let m = e;
  for (const [, far] of hits) m = m === e ? far : e;
  return m;
}
