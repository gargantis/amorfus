// ORACLE, not a method (breaks the honesty rule on purpose): production
// geometry, plus TWO linear channels per boundary (MSDF-like: min of two edge distances) taken from the
// scene's ideal curve, interpolated linearly within each triangle (what the
// GPU does with a per-vertex varying) and thresholded in the fragment. It
// measures the floor of any "per-vertex distance field" representation
// (Valve-style SDF in a reserved vertex byte) when the field itself is
// right — e.g. when the generator supplies it, as hints do for shape.
// u8 quantisation over +-2 blocks is applied (1/64 block steps).
export const name = 'pa-oracle-sdf2';
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
  // two channels per ideal: band -> its two edges; rect -> x and z slabs;
  // line/disc -> the same distance twice
  const ch = (id, x, z) => {
    if (id.kind === 'band') {
      const s = (x - id.p0[0]) * -Math.sin(id.theta) + (z - id.p0[1]) * Math.cos(id.theta);
      return [id.hw + s, id.hw - s];
    }
    if (id.kind === 'rect') {
      const cx = (id.lo[0] + id.hi[0]) / 2, cz = (id.lo[1] + id.hi[1]) / 2;
      const hx = (id.hi[0] - id.lo[0]) / 2, hz = (id.hi[1] - id.lo[1]) / 2;
      return [hx - Math.abs(x - cx), hz - Math.abs(z - cz)];
    }
    const d = dist(id, x, z);
    return [d, d];
  };
  m.attrDim = Math.max(2, 2 * ideals.length);
  m.attrs = new Float64Array(m.V * m.attrDim);
  for (let v = 0; v < m.V; v++) {
    ideals.forEach((id, k) => {
      const [a, b] = ch(id, m.pos[v * 3], m.pos[v * 3 + 2]);
      m.attrs[v * m.attrDim + 2 * k] = q8(a);
      m.attrs[v * m.attrDim + 2 * k + 1] = q8(b);
    });
  }
  cur = { ideals };
  return m;
}

export function fragment(attrs, info, scene) {
  const { ideals } = cur;
  if (!ideals.length) return info.ownMat;
  // positive = inside the feature for every ideal kind above
  for (let k = ideals.length - 1; k >= 0; k--) {
    if (Math.min(attrs[2 * k], attrs[2 * k + 1]) > 0) return ideals[k].pair[1];
  }
  return ideals[0].pair[0];
}
