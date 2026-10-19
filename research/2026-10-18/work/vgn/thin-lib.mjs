import * as core from '../../harness/core.mjs';
export function normalStats(m) {
  const fn = [0, 0, 0, 0];
  let pairs = 0, inv = 0, off60 = 0, vertA = 0, wrongTop = 0, horizA = 0, wrongSide = 0, angSum = 0, areaSum = 0;
  const invTris = new Set();
  for (let t = 0; t < m.T; t++) {
    core.faceNormal(m, t, fn);
    const area = fn[3];
    if (!(area > 1e-9)) continue;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      const v = m.tri[t * 3 + k];
      if (m.flags[v] & 3) continue; // flat-shaded vertex: uses the face normal
      const d = m.nrm[v * 3] * fn[0] + m.nrm[v * 3 + 1] * fn[1] + m.nrm[v * 3 + 2] * fn[2];
      pairs++;
      if (d < 0) { inv++; invTris.add(t); }
      if (d < 0.5) off60++;
      angSum += Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI * area;
      areaSum += area;
      cx += m.nrm[v * 3]; cy += m.nrm[v * 3 + 1]; cz += m.nrm[v * 3 + 2];
    }
    const l = Math.hypot(cx, cy, cz);
    if (l < 1e-9) continue;
    const ax = Math.abs(cx / l) ** 4, ay = Math.abs(cy / l) ** 4, az = Math.abs(cz / l) ** 4;
    const wy = ay / (ax + ay + az);
    if (Math.abs(fn[1]) < 0.15) { vertA += area; if (wy > 0.3) wrongTop += area; }
    if (Math.abs(fn[1]) > 0.95) { horizA += area; if (wy < 0.5) wrongSide += area; }
  }
  return { pairs, inv, invTris: invTris.size, off60, meanAng: angSum / areaSum, wrongTop: vertA ? wrongTop / vertA : 0, wrongSide: horizA ? wrongSide / horizA : 0 };
}
