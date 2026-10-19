// gn-best's AO (team gn, work/gn/src/core/mesh/mesher.ts, fastShade path),
// re-implemented as a post-pass over a decoded mesh so any geometry can be
// rendered with it: a 4-block-wide box centred at the vertex's ACTUAL
// quantised position (blocks c−3 … c+2 per axis, piecewise-linear end
// weights), over the partial-volume field clamp(½ + 4ρ, 0, 1) for generated
// blocks and occupancy for shape-edited ones; AO = clamp(1 − 4.8·max(0,
// F − ½)², 0.55, 1), quantised to the vertex's u8. Needs mesh.corner.
// Verified byte-identical to gn-best's own AO bytes (work/gh/gnao-check.mjs).
const GAIN = 4.8, BIAS = 0.5, AOMIN = 0.55;

function boxWeights(d, w) {
  // d = quantised offset (blocks) in [−½, ½]; weights for blocks c−3 … c+2
  w.fill(0);
  if (d <= 0) {
    w[0] = -d / 4; w[1] = 0.25; w[2] = 0.25; w[3] = 0.25; w[4] = (1 + d) / 4;
  } else {
    w[1] = (1 - d) / 4; w[2] = 0.25; w[3] = 0.25; w[4] = 0.25; w[5] = d / 4;
  }
}

/** Returns a new Float64Array of AO values (already u8-quantised / 255). */
export function gnAo(mesh, region) {
  const { nx, ny, nz, apron, blocks, rho, shapeEdited } = region;
  if (!mesh.corner) throw new Error('gnAo needs mesh.corner (study mesher)');
  const bi = (x, y, z) => (y * nz + z) * nx + x;
  const pv = new Float64Array(nx * ny * nz);
  for (let i = 0; i < pv.length; i++) {
    if (shapeEdited[i] === 1) pv[i] = (blocks[i] & 0xff) !== 0 ? 1 : 0;
    else { const v = 0.5 + 4 * rho[i]; pv[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
  }
  const wx = new Float64Array(6), wy = new Float64Array(6), wz = new Float64Array(6);
  const out = new Float64Array(mesh.V);
  for (let v = 0; v < mesh.V; v++) {
    const cx = mesh.corner[v * 3], cy = mesh.corner[v * 3 + 1], cz = mesh.corner[v * 3 + 2];
    // quantised offsets in 1/256 (exact: positions are k/256 − ½ … )
    const qx = Math.round((mesh.pos[v * 3] + 0.5) * 256) - 128 - 256 * cx;
    const qy = Math.round((mesh.pos[v * 3 + 1] + 0.5) * 256) - 128 - 256 * cy;
    const qz = Math.round((mesh.pos[v * 3 + 2] + 0.5) * 256) - 128 - 256 * cz;
    // gn: kernel(u = dq/256 + ½) with d0 = u − ½ — same float ops as gn
    boxWeights(qx / 256 + 0.5 - 0.5, wx);
    boxWeights(qy / 256 + 0.5 - 0.5, wy);
    boxWeights(qz / 256 + 0.5 - 0.5, wz);
    const x0 = cx + apron - 3, y0 = cy + apron - 3, z0 = cz + apron - 3;
    let f = 0;
    for (let ky = 0; ky < 6; ky++) {
      const a = wy[ky];
      if (a === 0) continue;
      for (let kz = 0; kz < 6; kz++) {
        const b = a * wz[kz];
        if (b === 0) continue;
        let ib = bi(x0, y0 + ky, z0 + kz);
        for (let kx = 0; kx < 6; kx++, ib++) {
          const c = wx[kx];
          if (c === 0) continue;
          f += b * c * pv[ib];
        }
      }
    }
    const ex = f - BIAS > 0 ? f - BIAS : 0;
    let ao = 1 - GAIN * ex * ex;
    ao = ao < AOMIN ? AOMIN : ao > 1 ? 1 : ao;
    out[v] = Math.round(ao * 255) / 255;
  }
  return out;
}

/** Decoded mesh with gn AO in place of the mesher's AO. */
export function withGnAo(mesh, region) {
  mesh.ao = gnAo(mesh, region);
  return mesh;
}
