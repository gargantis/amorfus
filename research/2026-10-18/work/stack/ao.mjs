// stack — gn's AO (box kernel at the vertex's ACTUAL quantised position over
// the partial-volume field) as a post-pass over a decoded mesh. Copied from
// work/gh/gnao.mjs (itself byte-identical to gn-best's AO bytes) with the
// onset curve as a parameter:
//   'quad'   AO = clamp(1 − 4.8·max(0, F − ½)², 0.55, 1)   (gn-best)
//   'linear' AO = clamp(1 − 1.2·max(0, F − ½),  0.55, 1)   (gn-ao; production's curve)
// F = 4-wide box (blocks c−3 … c+2 per axis, piecewise-linear end weights)
// over pv = clamp(½ + 4ρ, 0, 1) for generated blocks, occupancy for
// shape-edited blocks. Reach: 3 blocks from the lattice corner.
// Only + − × and comparisons in a fixed order; Math.round for the u8.
// Verified against gn's own mesher (work/stack/check-ao.mjs).
export const CURVES = {
  quad: { gain: 4.8, bias: 0.5, min: 0.55, quad: true },
  linear: { gain: 1.2, bias: 0.5, min: 0.55, quad: false },
};

function boxWeights(d, w) {
  // d = quantised offset (blocks) in [−½, ½]; weights for blocks c−3 … c+2
  w.fill(0);
  if (d <= 0) {
    w[0] = -d / 4; w[1] = 0.25; w[2] = 0.25; w[3] = 0.25; w[4] = (1 + d) / 4;
  } else {
    w[1] = (1 - d) / 4; w[2] = 0.25; w[3] = 0.25; w[4] = 0.25; w[5] = d / 4;
  }
}

/** Partial-volume field of a region (cached on the region object). */
export function partialVolume(region) {
  if (region.__pv) return region.__pv;
  const { nx, ny, nz, blocks, rho, shapeEdited } = region;
  const pv = new Float64Array(nx * ny * nz);
  for (let i = 0; i < pv.length; i++) {
    if (shapeEdited[i] === 1) pv[i] = (blocks[i] & 0xff) !== 0 ? 1 : 0;
    else { const v = 0.5 + 4 * rho[i]; pv[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
  }
  Object.defineProperty(region, '__pv', { value: pv, enumerable: false });
  return pv;
}

/** Box AO per vertex (u8-quantised / 255). Needs mesh.corner. */
export function boxAo(mesh, region, curve = 'quad', out = new Float64Array(mesh.V)) {
  const C = CURVES[curve];
  if (!C) throw new Error(`unknown AO curve ${curve}`);
  const { nx, nz, apron } = region;
  if (!mesh.corner) throw new Error('boxAo needs mesh.corner (study mesher)');
  const pv = partialVolume(region);
  const wx = new Float64Array(6), wy = new Float64Array(6), wz = new Float64Array(6);
  for (let v = 0; v < mesh.V; v++) {
    const cx = mesh.corner[v * 3], cy = mesh.corner[v * 3 + 1], cz = mesh.corner[v * 3 + 2];
    const qx = Math.round((mesh.pos[v * 3] + 0.5) * 256) - 128 - 256 * cx;
    const qy = Math.round((mesh.pos[v * 3 + 1] + 0.5) * 256) - 128 - 256 * cy;
    const qz = Math.round((mesh.pos[v * 3 + 2] + 0.5) * 256) - 128 - 256 * cz;
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
        let ib = ((y0 + ky) * nz + z0 + kz) * nx + x0;
        for (let kx = 0; kx < 6; kx++, ib++) {
          const c = wx[kx];
          if (c === 0) continue;
          f += b * c * pv[ib];
        }
      }
    }
    const ex = f - C.bias > 0 ? f - C.bias : 0;
    let ao = 1 - C.gain * (C.quad ? ex * ex : ex);
    ao = ao < C.min ? C.min : ao > 1 ? 1 : ao;
    out[v] = Math.round(ao * 255) / 255;
  }
  return out;
}
