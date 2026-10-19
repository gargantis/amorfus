// Independent clearance checks on the RENDER triangles (the harness's tunnel
// and pillar checks use vertex extents, which cannot see a refined surface
// bulging between vertices).
//  tunnel-1x2: slice at several z; best capsule (r 0.3, h 1.8) placement →
//              its min distance to the walls (>= 0.30 means the player fits),
//              plus min free width over the capsule's cylinder band.
//  pillar:     slice at mid-height; min width over 36 directions (>= 0.40).
//  floating:   min extent over 3 axes of the rendered surface (>= 0.40).
//  room:       harness roof gap (vertical rays) is already a true clearance.
//  Also: max distance of refined vertices from the control (hints) surface.
import * as core from '../../harness/core.mjs';
import { CONSTRAINT_SCENES, BASE } from '../../harness/scenes.mjs';

function slice(m, axis, c0) {
  // segments where plane coord[axis] = c0 cuts triangles, in the other two coords
  const segs = [];
  const [u, v] = axis === 2 ? [0, 1] : axis === 1 ? [0, 2] : [1, 2];
  for (let t = 0; t < m.T; t++) {
    const vs = [m.tri[t * 3], m.tri[t * 3 + 1], m.tri[t * 3 + 2]];
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = vs[e], b = vs[(e + 1) % 3];
      const da = m.pos[a * 3 + axis] - c0, db = m.pos[b * 3 + axis] - c0;
      if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
        const s = da / (da - db);
        pts.push([m.pos[a * 3 + u] + s * (m.pos[b * 3 + u] - m.pos[a * 3 + u]), m.pos[a * 3 + v] + s * (m.pos[b * 3 + v] - m.pos[a * 3 + v])]);
      }
    }
    if (pts.length === 2) segs.push(pts);
  }
  return segs;
}
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
// distance between segment pq (capsule axis) and segment ab
function segSegDist(p, q, a, b) {
  // sample-free exact-ish: min of endpoint-to-segment distances and intersection check
  const cross = (o, x, y) => (x[0] - o[0]) * (y[1] - o[1]) - (x[1] - o[1]) * (y[0] - o[0]);
  const d1 = cross(p, q, a), d2 = cross(p, q, b), d3 = cross(a, b, p), d4 = cross(a, b, q);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segDist(p, a, b), segDist(q, a, b), segDist(a, p, q), segDist(b, p, q));
}

export function tunnelCheck(m) {
  let worstFit = Infinity, worstWidth = Infinity, worstHeight = Infinity;
  for (const z of [8.3, 11.7, 15.1, 16.5, 19.9, 23.3]) {
    const segs = slice(m, 2, z).filter((s) => Math.abs(s[0][0] - 16.5) < 1.5 && s[0][1] > 6.5 && s[0][1] < 11.5);
    // best capsule placement: axis vertical from (x, y0+0.3) to (x, y0+1.5)
    let best = -Infinity;
    for (let x = 16.2; x <= 16.8001; x += 0.01) {
      for (let y0 = 7.9; y0 <= 8.4; y0 += 0.01) {
        const p = [x, y0 + 0.3], q = [x, y0 + 1.5];
        let dmin = Infinity;
        for (const s of segs) { const d = segSegDist(p, q, s[0], s[1]); if (d < dmin) dmin = d; }
        if (dmin > best) best = dmin;
      }
    }
    worstFit = Math.min(worstFit, best);
    // free width at heights 8.3..9.5 (cylinder band of a capsule standing on y=8)
    for (let y = 8.3; y <= 9.5; y += 0.02) {
      let L = -Infinity, R = Infinity;
      for (const s of segs) {
        const [a, b] = s;
        if ((a[1] - y) * (b[1] - y) > 0) continue;
        const t = (y - a[1]) / (b[1] - a[1] || 1e-12);
        const x = a[0] + t * (b[0] - a[0]);
        if (x < 16.5) L = Math.max(L, x); else R = Math.min(R, x);
      }
      worstWidth = Math.min(worstWidth, R - L);
    }
    for (let x = 16.25; x <= 16.75; x += 0.02) {
      let F = -Infinity, C = Infinity;
      for (const s of segs) {
        const [a, b] = s;
        if ((a[0] - x) * (b[0] - x) > 0) continue;
        const t = (x - a[0]) / (b[0] - a[0] || 1e-12);
        const y = a[1] + t * (b[1] - a[1]);
        if (y < 9) F = Math.max(F, y); else C = Math.min(C, y);
      }
      worstHeight = Math.min(worstHeight, C - F);
    }
  }
  return { capsuleClearance: worstFit, minWidth: worstWidth, minHeightCentre: worstHeight };
}

export function pillarCheck(m) {
  const segs = slice(m, 1, BASE + 3).filter((s) => Math.abs(s[0][0] - 16.5) < 1 && Math.abs(s[0][1] - 16.5) < 1);
  let minW = Infinity;
  for (let k = 0; k < 36; k++) {
    const th = (k * Math.PI) / 36;
    const d = [Math.cos(th), Math.sin(th)];
    let lo = Infinity, hi = -Infinity;
    for (const s of segs) for (const p of s) { const t = p[0] * d[0] + p[1] * d[1]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
    minW = Math.min(minW, hi - lo);
  }
  return { minWidth: minW };
}

export function floatingCheck(m) {
  const e = [0, 1, 2].map((a) => { let lo = Infinity, hi = -Infinity; for (let v = 0; v < m.V; v++) { lo = Math.min(lo, m.pos[v * 3 + a]); hi = Math.max(hi, m.pos[v * 3 + a]); } return hi - lo; });
  // extent through the centre lines (rays along each axis through 16.5,16.5,16.5)
  return { minExtent: Math.min(...e) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = process.argv.slice(2);
  for (const n of names) {
    const A = await import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href);
    const out = [n.padEnd(10)];
    for (const s of CONSTRAINT_SCENES) {
      if (!['tunnel-1x2', 'pillar', 'floating-block'].includes(s.name)) continue;
      const region = core.buildRegion(s.cell, A.apron ?? 10);
      const m = A.mesh(region, null, core);
      if (s.name === 'tunnel-1x2') { const r = tunnelCheck(m); out.push(`tunnel capsule clearance ${r.capsuleClearance.toFixed(3)} (need 0.300) width ${r.minWidth.toFixed(3)} height ${r.minHeightCentre.toFixed(3)}`); }
      if (s.name === 'pillar') out.push(`pillar min width ${pillarCheck(m).minWidth.toFixed(3)}`);
      if (s.name === 'floating-block') out.push(`floating min extent ${floatingCheck(m).minExtent.toFixed(3)}`);
    }
    console.log(out.join(' | '));
  }
}
