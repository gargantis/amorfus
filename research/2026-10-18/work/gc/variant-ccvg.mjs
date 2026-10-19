// diagnostic (not a deliverable): CC limit stencil on the hints vertices, clamped to the mesher box
import { controlMesh, levelFromControl, levelTopology, ccLimit, levelNormals, emitLevel } from './lib-gc.mjs';
export const name = 'gc-diag-ccvg';
export const apron = 13;
export function mesh(region) {
  const { c } = controlMesh(region);
  let L = levelFromControl(c);
  const T = levelTopology(L);
  L = ccLimit(L, T);
  for (let v = 0; v < c.vertCount; v++) for (let a = 0; a < 3; a++) {
    const cc = (a === 0 ? c.cx[v] : a === 1 ? c.cy[v] : c.cz[v]) * 256;
    const d0 = c.dq[v * 3 + a];
    const lo = Math.min(Math.ceil(c.lo[v * 3 + a] * 256 - 1e-9), d0), hi = Math.max(Math.floor(c.hi[v * 3 + a] * 256 + 1e-9), d0);
    const off = L.P[v * 3 + a] - cc;
    L.P[v * 3 + a] = cc + (off < lo ? lo : off > hi ? hi : off);
  }
  return emitLevel(c, L, levelNormals(L));
}
