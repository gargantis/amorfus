// pa-vol: production geometry (hints rule) + a fragment rule that reads the
// block materials from a per-chunk volume (what a 3-D r8uint texture of
// block materials, or two rgba8 per-material occupancy textures, would give
// the GPU), at q = p - n*DELTA (half a block inside the surface), and takes
// the material with the largest kernel weight over SOLID block centres.
//
// GPU path: one u8 per block, 34^3 per chunk with a 1-block apron
// (~39 KiB/chunk), or 8 per-material unorm channels (two rgba8 3-D textures,
// ~78 KiB/chunk) so the hardware trilinear filter does the weighting in two
// fetches. Fragment-side, so exempt from the golden hashes.
//
// KERNEL env: 'tri' (trilinear, 8 blocks) | 'bspl' (quadratic B-spline, 27).
const KERNEL = process.env.PA_KERNEL ?? 'tri';
const DELTA = Number(process.env.PA_DELTA ?? 0.5);
export const name = `pa-vol-${KERNEL}`;
export const describe = `hints geometry; fragment picks argmax material of a ${KERNEL} kernel over solid block centres at p - ${DELTA}n`;

let cur = null;
export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  cur = { region, m, core };
  return m;
}

const acc = new Float64Array(256);
const touched = [];
function add(mat, w) {
  if (acc[mat] === 0) touched.push(mat);
  acc[mat] += w;
}
function matAt(x, y, z) {
  const { region } = cur;
  const i = cur.core.regionIndex(region, x, y, z);
  if (i < 0) return 0;
  return region.blocks[i] & 0xff;
}

export function fragment(attrs, info) {
  const { m } = cur;
  const { a, b, c, w } = info;
  // smooth shading normal (what the GPU interpolates)
  let nx = w[0] * m.nrm[a * 3] + w[1] * m.nrm[b * 3] + w[2] * m.nrm[c * 3];
  let ny = w[0] * m.nrm[a * 3 + 1] + w[1] * m.nrm[b * 3 + 1] + w[2] * m.nrm[c * 3 + 1];
  let nz = w[0] * m.nrm[a * 3 + 2] + w[1] * m.nrm[b * 3 + 2] + w[2] * m.nrm[c * 3 + 2];
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  const qx = info.x - nx * DELTA, qy = info.y - ny * DELTA, qz = info.z - nz * DELTA;
  touched.length = 0;
  if (KERNEL === 'tri') {
    const bx = Math.floor(qx - 0.5), by = Math.floor(qy - 0.5), bz = Math.floor(qz - 0.5);
    const fx = qx - 0.5 - bx, fy = qy - 0.5 - by, fz = qz - 0.5 - bz;
    for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
      const mat = matAt(bx + dx, by + dy, bz + dz);
      if (mat === 0) continue;
      const wt = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      if (wt > 0) add(mat, wt);
    }
  } else if (KERNEL === 'gauss') {
    // wide isotropic kernel (sigma PA_SIGMA blocks, radius 3) in x and z,
    // trilinear in y: how far does pure blur get on shallow staircases?
    const sg = Number(process.env.PA_SIGMA ?? 1);
    const by = Math.floor(qy - 0.5), fy = qy - 0.5 - by;
    const cx = Math.round(qx - 0.5), cz = Math.round(qz - 0.5);
    for (let dy = 0; dy < 2; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const mat = matAt(cx + dx, by + dy, cz + dz);
      if (mat === 0) continue;
      const ex = cx + dx + 0.5 - qx, ez = cz + dz + 0.5 - qz;
      const wt = (dy ? fy : 1 - fy) * Math.exp(-(ex * ex + ez * ez) / (2 * sg * sg));
      if (wt > 0) add(mat, wt);
    }
  } else {
    const cx = Math.round(qx - 0.5), cy = Math.round(qy - 0.5), cz = Math.round(qz - 0.5);
    const tx = qx - 0.5 - cx, ty = qy - 0.5 - cy, tz = qz - 0.5 - cz;
    const k = (t) => [0.5 * (0.5 - t) ** 2, 0.75 - t * t, 0.5 * (0.5 + t) ** 2];
    const kx = k(tx), ky = k(ty), kz = k(tz);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const mat = matAt(cx + dx, cy + dy, cz + dz);
      if (mat === 0) continue;
      add(mat, kx[dx + 1] * ky[dy + 1] * kz[dz + 1]);
    }
  }
  let best = info.ownMat, bw = -1;
  for (const mt of touched) {
    if (acc[mt] > bw || (acc[mt] === bw && mt === info.ownMat)) { bw = acc[mt]; best = mt; }
    acc[mt] = 0;
  }
  return best;
}
