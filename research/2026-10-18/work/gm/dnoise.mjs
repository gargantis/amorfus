// How far do surface vertices sit from the D = 0 level set? (D16 plane,
// trilinear at the vertex). Natural-surface vertices only (|D| < 0.5).
import * as core from '../../harness/core.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { BENCH } from './terrain-metrics.mjs';
function tri(P, scale, nx, ny, nz, x, y, z) {
  const qx = x - 0.5, qy = y - 0.5, qz = z - 0.5;
  const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz);
  const tx = qx - ix, ty = qy - iy, tz = qz - iz, SY = nx * nz, SZ = nx, b = (iy * nz + iz) * nx + ix;
  const c = (o) => P[b + o];
  const x00 = c(0) + (c(1) - c(0)) * tx, x10 = c(SY) + (c(SY + 1) - c(SY)) * tx, x01 = c(SZ) + (c(SZ + 1) - c(SZ)) * tx, x11 = c(SY + SZ) + (c(SY + SZ + 1) - c(SY + SZ)) * tx;
  const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
  return (y0 + (y1 - y0) * tz) / scale;
}
const vals = [], hintVals = [];
for (const c of BENCH) {
  const inp = buildGenMeshInputGM([1, 1], ...c, new Map(), { forceApron: 3 }).input;
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  for (let v = 0; v < m.V; v++) {
    const x = m.pos[v * 3] + 3, y = m.pos[v * 3 + 1] + 3, z = m.pos[v * 3 + 2] + 3;
    const d = tri(inp.gmD16, 256, inp.nx, inp.ny, inp.nz, x, y, z);
    const r = tri(inp.rho, 0.25, inp.nx, inp.ny, inp.nz, x, y, z); // hint d = 4·rho
    if (Math.abs(d) < 0.5) vals.push(d);
    if (Math.abs(d) < 0.5) hintVals.push(r);
  }
}
const st = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return { n: a.length, mean: m.toFixed(4), std: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length).toFixed(4), p99: a.map(Math.abs).sort((x, y) => x - y)[Math.floor(a.length * 0.99)].toFixed(4) }; };
console.log('D (dTerrain) at natural-surface vertices:', st(vals));
console.log('hint d (=4·rho, incl. caves) at the same vertices:', st(hintVals));
