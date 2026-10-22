// Exact (closed-form + 1-D root find) bubble geometry, team phys.
// 3D: sphere of volume V; standard double bubble of volumes V1 <= V2
// (two spheres and a spherical wall meeting at 120 degrees, Young-Laplace
// wall radius r1*r2/(r2 - r1)). 2D: the same with circles and areas.
// Coordinates of a double bubble: axis = x, bubble 1 (the smaller) centre at
// x = 0, bubble 2 centre at x = d, junction circle in the plane x = xj.

const capVol = (r, h) => (Math.PI * h * h * (3 * r - h)) / 3; // sphere cap of height h
const segArea = (r, h) => r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(Math.max(0, 2 * r * h - h * h)); // disc segment

export const sphereR = (V) => Math.cbrt((3 * V) / (4 * Math.PI));
export const circleR = (A) => Math.sqrt(A / Math.PI);

/** Shape of a double bubble with r1 = 1, r2 = q >= 1 (unscaled). */
function shape(q, dims) {
  const d = Math.sqrt(1 + q * q - q); // normals at the junction 60 degrees apart
  const xj = (d * d + 1 - q * q) / (2 * d);
  const a = Math.sqrt(1 - xj * xj);
  const r3 = q === 1 ? Infinity : q / (q - 1);
  const h3 = r3 === Infinity ? 0 : r3 - Math.sqrt(r3 * r3 - a * a); // wall sagitta (bulges toward +x, into bubble 2)
  let V1, V2;
  if (dims === 3) {
    const wall = r3 === Infinity ? 0 : capVol(r3, h3);
    V1 = (4 / 3) * Math.PI - capVol(1, 1 - xj) + wall;
    V2 = (4 / 3) * Math.PI * q ** 3 - capVol(q, q - (d - xj)) - wall;
  } else {
    const wall = r3 === Infinity ? 0 : segArea(r3, h3);
    V1 = Math.PI - segArea(1, 1 - xj) + wall;
    V2 = Math.PI * q * q - segArea(q, q - (d - xj)) - wall;
  }
  return { q, d, xj, a, r3, h3, V1, V2 };
}

/** Double bubble with volumes (areas in 2D) V1, V2. Returns lengths in the
 *  same units as V^(1/dims). */
export function doubleBubble(V1, V2, dims = 3) {
  const swap = V1 > V2;
  const [v1, v2] = swap ? [V2, V1] : [V1, V2];
  const ratio = v2 / v1;
  let lo = 1, hi = 1;
  while (shape(hi, dims).V2 / shape(hi, dims).V1 < ratio) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const m = 0.5 * (lo + hi);
    const s = shape(m, dims);
    if (s.V2 / s.V1 < ratio) lo = m; else hi = m;
  }
  const s = shape(0.5 * (lo + hi), dims);
  const k = dims === 3 ? Math.cbrt(v1 / s.V1) : Math.sqrt(v1 / s.V1); // scale
  const r1 = k, r2 = k * s.q, r3 = k * s.r3, d = k * s.d, xj = k * s.xj, a = k * s.a, h3 = k * s.h3;
  // positions along the axis, bubble 1 centre at 0
  const tip1 = -r1, tip2 = d + r2, wallApex = xj + h3;
  // surface area (3D) or perimeter (2D) of all films
  let energy;
  if (dims === 3) {
    const capArea = (r, h) => 2 * Math.PI * r * h;
    const out1 = 4 * Math.PI * r1 * r1 - capArea(r1, r1 - xj);
    const out2 = 4 * Math.PI * r2 * r2 - capArea(r2, r2 - (d - xj));
    const wall = r3 === Infinity ? Math.PI * a * a : capArea(r3, h3);
    energy = { out1, out2, wall, total: out1 + out2 + wall };
  } else {
    const arc = (r, h) => 2 * r * Math.acos((r - h) / r);
    const out1 = 2 * Math.PI * r1 - arc(r1, r1 - xj);
    const out2 = 2 * Math.PI * r2 - arc(r2, r2 - (d - xj));
    const wall = r3 === Infinity ? 2 * a : arc(r3, h3);
    energy = { out1, out2, wall, total: out1 + out2 + wall };
  }
  return {
    dims, V1: v1, V2: v2, swapped: swap, r1, r2, r3, d, xj, a, h3, tip1, tip2, wallApex,
    length: tip2 - tip1, wallToTip1: xj - tip1, wallToTip2: tip2 - xj,
    youngLaplace: r3 === Infinity ? Infinity : (r1 * r2) / (r2 - r1), energy,
  };
}

/** Energy of a single sphere/circle of volume/area V. */
export const singleEnergy = (V, dims = 3) => (dims === 3 ? 4 * Math.PI * sphereR(V) ** 2 : 2 * Math.PI * circleR(V));

if (import.meta.url === `file://${process.argv[1]}`) {
  const e = doubleBubble(1, 1, 3);
  console.log('3D equal unit: a', e.a.toFixed(4), 'wall-to-tip', e.wallToTip1.toFixed(4), 'r', e.r1.toFixed(4));
  console.log('3D 1:2', JSON.stringify(doubleBubble(1, 2, 3), (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
  console.log('2D 1:1', JSON.stringify(doubleBubble(1, 1, 2), (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
  console.log('2D 1:2', JSON.stringify(doubleBubble(1, 2, 2), (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)));
  console.log('sphere V=1', sphereR(1).toFixed(4), 'circle A=1', circleR(1).toFixed(4));
}
