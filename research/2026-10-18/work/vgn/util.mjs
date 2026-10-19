// vgn shared helpers: edit maps in the production format, generated blocks.
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
export const CHUNK = 32;
const CX_MIN = -(2 ** 18), CX_SPAN = 2 ** 19, CY_MIN = -8, CY_SPAN = 24;
export const chunkKey = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
export const local = (x, y, z) => (y * 32 + z) * 32 + x;
export function setBlock(edits, wx, wy, wz, v) {
  const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32), cz = Math.floor(wz / 32);
  const k = chunkKey(cx, cy, cz);
  if (!edits.has(k)) edits.set(k, new Map());
  edits.get(k).set(local(wx - cx * 32, wy - cy * 32, wz - cz * 32), v);
}
/** generated blocks of a world box [x0,x0+n) etc. via the production builder (no edits) */
export function genBox(seed, x0, y0, z0, nx, ny, nz) {
  // build from 32³ chunks
  const out = new Uint16Array(nx * ny * nz);
  const rho = new Float32Array(nx * ny * nz);
  const cache = new Map();
  const get = (cx, cy, cz) => {
    const k = `${cx},${cy},${cz}`;
    let r = cache.get(k);
    if (!r) { r = buildGenMeshInput(seed, cx, cy, cz, new Map(), { forceApron: 0 }).input; cache.set(k, r); }
    return r;
  };
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const wx = x0 + x, wy = y0 + y, wz = z0 + z;
    const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32), cz = Math.floor(wz / 32);
    const r = get(cx, cy, cz);
    const i = ((wy - cy * 32) * 32 + (wz - cz * 32)) * 32 + (wx - cx * 32);
    out[(y * nz + z) * nx + x] = r.blocks[i];
    rho[(y * nz + z) * nx + x] = r.rho[i];
  }
  return { blocks: out, rho };
}
export const SEEDS = { s1: [1, 1], s7: [7, 7] };
