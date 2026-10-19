// pa-ao: production geometry (hints rule) with the per-vertex AO recomputed
// to test one claim: block-shaped AO bands come from (a) anchoring the
// window at the lattice corner and (b) counting BINARY blocks under a
// surface that is smooth. Variants (PA_AO):
//   lattice   — the production rule (4x4x4 box at the lattice corner)
//   tent-bin  — tent kernel (half-width 2) at the vertex's true position, binary blocks
//   tent-rho  — same kernel, partial-volume occupancy from the generator
//               density: occ = clamp(0.5 + 2*rho) (rho = d/4 in the scenes;
//               edited cells have rho = +-1, so they stay binary)
//   bspl-rho  — quadratic B-spline (support 4, C1) at the true position, rho occupancy
// Only + - * / and comparisons: deterministic as stored data would require.
const MODE = process.env.PA_AO ?? 'tent-rho';
export const name = `pa-ao-${MODE}`;
export const describe = `hints geometry; per-vertex AO from ${MODE}`;

export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  const { nx, ny, nz, apron, blocks, rho } = region;
  const occBin = (i) => ((blocks[i] & 0xff) !== 0 ? 1 : 0);
  const occRho = (i) => {
    const o = 0.5 + 2 * rho[i];
    return o < 0 ? 0 : o > 1 ? 1 : o;
  };
  const occ = MODE.endsWith('rho') ? occRho : occBin;
  const tent = (d) => { const a = d < 0 ? -d : d; return a < 2 ? 1 - a / 2 : 0; };
  const bspl = (d) => {
    // quadratic B-spline with support [-2, 2] (scaled by 4/3)
    const t = ((d < 0 ? -d : d) * 3) / 4; // unit spline support [-1.5, 1.5]
    if (t < 0.5) return 0.75 - t * t;
    if (t < 1.5) return 0.5 * (1.5 - t) * (1.5 - t);
    return 0;
  };
  const K = MODE.startsWith('bspl') ? bspl : tent;
  let sum = 0, mn = 1;
  for (let v = 0; v < m.V; v++) {
    let f;
    if (MODE === 'lattice') {
      // reproduce production: corner = nearest lattice corner of the vertex
      const cx = m.corner ? m.corner[v * 3] + apron : Math.round(m.pos[v * 3]) + apron;
      const cy = m.corner ? m.corner[v * 3 + 1] + apron : Math.round(m.pos[v * 3 + 1]) + apron;
      const cz = m.corner ? m.corner[v * 3 + 2] + apron : Math.round(m.pos[v * 3 + 2]) + apron;
      let c = 0, n = 0;
      for (let y = cy - 2; y < cy + 2; y++) for (let z = cz - 2; z < cz + 2; z++) for (let x = cx - 2; x < cx + 2; x++) {
        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
        n++; c += occBin((y * nz + z) * nx + x);
      }
      f = n ? c / n : 0;
    } else {
      // region coords of the vertex; block (x,y,z) has its centre at +0.5
      const px = m.pos[v * 3] + apron, py = m.pos[v * 3 + 1] + apron, pz = m.pos[v * 3 + 2] + apron;
      const x0 = Math.floor(px - 2.5), y0 = Math.floor(py - 2.5), z0 = Math.floor(pz - 2.5);
      let c = 0, wsum = 0;
      for (let y = y0; y <= y0 + 5; y++) {
        const wy = K(y + 0.5 - py);
        if (wy === 0) continue;
        for (let z = z0; z <= z0 + 5; z++) {
          const wz = K(z + 0.5 - pz);
          if (wz === 0) continue;
          for (let x = x0; x <= x0 + 5; x++) {
            const wx = K(x + 0.5 - px);
            if (wx === 0) continue;
            if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
            const w = wx * wy * wz;
            wsum += w;
            c += w * occ((y * nz + z) * nx + x);
          }
        }
      }
      f = wsum > 0 ? c / wsum : 0;
    }
    let ao = 1 - 1.2 * (f > 0.5 ? f - 0.5 : 0);
    ao = ao < 0.55 ? 0.55 : ao > 1 ? 1 : ao;
    m.ao[v] = Math.round(ao * 255) / 255;
    sum += m.ao[v];
    if (m.ao[v] < mn) mn = m.ao[v];
  }
  if (scene) console.error(`  [${scene.name}] AO mean ${(sum / m.V).toFixed(3)} min ${mn.toFixed(3)}`);
  return m;
}
