// Measuring helpers on a finished sim (block coordinates).
import { sampleGrid, phaseAt } from './mbo.mjs';

/** First crossing of the surface D = 0 along p + t·dir, t ∈ [0, maxT].
 *  Returns { t, point, inside0 } or null; inside0 says whether p was solid. */
export function surfaceAlong(sim, p, dir, maxT = 3, step = 0.005) {
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  const d = dir.map((v) => v / l);
  const D = (t) => sampleGrid(sim, sim.D, p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t);
  const s0 = D(0) > 0;
  let prev = 0;
  for (let t = step; t <= maxT; t += step) {
    if ((D(t) > 0) !== s0) {
      let a = prev, b = t;
      for (let i = 0; i < 40; i++) { const m = 0.5 * (a + b); if ((D(m) > 0) === s0) a = m; else b = m; }
      const tt = 0.5 * (a + b);
      return { t: tt, point: [p[0] + d[0] * tt, p[1] + d[1] * tt, p[2] + d[2] * tt], inside0: s0 };
    }
    prev = t;
  }
  return null;
}

/** Points along the segment a→b where the owning phase changes (0 = air). */
export function ownerChanges(sim, a, b, step = 0.002) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const at = (t) => [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L, a[2] + (b[2] - a[2]) * t / L];
  const out = [];
  let prev = phaseAt(sim, ...at(0)), prevT = 0;
  for (let t = step; t <= L; t += step) {
    const q = phaseAt(sim, ...at(t));
    if (q !== prev) {
      let lo = prevT, hi = t;
      for (let i = 0; i < 30; i++) { const m = 0.5 * (lo + hi); if (phaseAt(sim, ...at(m)) === prev) lo = m; else hi = m; }
      out.push({ t: 0.5 * (lo + hi), point: at(0.5 * (lo + hi)), from: prev, to: q });
      prev = q;
    }
    prevT = t;
  }
  return out;
}

/** Height of the top surface (largest y with D > 0 crossing) above (x, z),
 *  searching down from yTop. */
export function topHeight(sim, x, z, yTop, yBottom) {
  const r = surfaceAlong(sim, [x, yTop, z], [0, -1, 0], yTop - yBottom);
  return r ? r.point[1] : null;
}

