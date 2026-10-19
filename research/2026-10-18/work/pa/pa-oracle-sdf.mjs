// ORACLE, not a method (breaks the honesty rule on purpose): production
// geometry, plus ONE signed distance per vertex per boundary taken from the
// scene's ideal curve, interpolated linearly within each triangle (what the
// GPU does with a per-vertex varying) and thresholded in the fragment. It
// measures the floor of any "per-vertex distance field" representation
// (Valve-style SDF in a reserved vertex byte) when the field itself is
// right — e.g. when the generator supplies it, as hints do for shape.
// u8 quantisation over +-2 blocks is applied (1/64 block steps).
export const name = 'pa-oracle-sdf';
export const describe = 'ORACLE: per-vertex signed distance to the ideal boundary (u8, +-2 blocks), linear in each triangle, thresholded';

const DEG = Math.PI / 180;
function dist(ideal, x, z) {
  switch (ideal.kind) {
    case 'line': return (x - ideal.p0[0]) * -Math.sin(ideal.theta) + (z - ideal.p0[1]) * Math.cos(ideal.theta);
    case 'band': return ideal.hw - Math.abs((x - ideal.p0[0]) * -Math.sin(ideal.theta) + (z - ideal.p0[1]) * Math.cos(ideal.theta));
    case 'disc': return ideal.r - Math.hypot(x - ideal.c[0], z - ideal.c[1]);
    case 'rect': {
      const cx = (ideal.lo[0] + ideal.hi[0]) / 2, cz = (ideal.lo[1] + ideal.hi[1]) / 2;
      const hx = (ideal.hi[0] - ideal.lo[0]) / 2, hz = (ideal.hi[1] - ideal.lo[1]) / 2;
      const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
      return -(Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0));
    }
    default: return 0;
  }
}
const q8 = (d) => Math.round(Math.max(-2, Math.min(2, d)) * 63.75) / 63.75;

let cur = null;
export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  const ideals = (scene?.ideals ?? []).filter((i) => i.kind !== 'line' || !i.ray);
  m.attrDim = Math.max(1, ideals.length);
  m.attrs = new Float64Array(m.V * m.attrDim);
  for (let v = 0; v < m.V; v++) {
    ideals.forEach((id, k) => { m.attrs[v * m.attrDim + k] = q8(dist(id, m.pos[v * 3], m.pos[v * 3 + 2])); });
  }
  cur = { ideals };
  return m;
}

export function fragment(attrs, info, scene) {
  const { ideals } = cur;
  if (!ideals.length) return info.ownMat;
  // positive = inside the feature for every ideal kind above
  for (let k = ideals.length - 1; k >= 0; k--) {
    if (attrs[k] > 0) return ideals[k].pair[1];
  }
  return ideals[0].pair[0];
}
