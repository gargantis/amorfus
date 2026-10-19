// Zoomed plan view of a terrain chunk with triangle edges, plus the column-top map.
//   node work/mv/tzoom.mjs <module|hints> cx,cy,cz x0 z0 w h [S=48] [out=png] [k=v]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { rasterTopDown, PALETTE } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const [modPath, chunkS, x0s, z0s, ws, hs, ...rest] = process.argv.slice(2);
const x0 = +x0s, z0 = +z0s, w = +ws, h = +hs;
let S = 48, out = 'work/mv/tzoom.png', map = false;
const over = {};
for (const a of rest) { const [k, v] = a.split('='); if (k === 'S') S = +v; else if (k === 'out') out = v; else if (k === 'map') map = true; else over[k] = isNaN(Number(v)) ? v : Number(v); }
const chunk = chunkS.split(',').map(Number);
let mesh, frag = null, apron = 10;
let mod = null;
if (modPath !== 'hints') {
  mod = await import(pathToFileURL(resolve(modPath)).href);
  if (mod.OPT) Object.assign(mod.OPT, over);
  apron = mod.apron ?? 10;
}
const inp = buildGenMeshInput([1, 1], ...chunk, new Map(), { forceApron: apron }).input;
if (mod) { mesh = mod.mesh(inp, null, core); if (mod.fragment) frag = (a, i) => mod.fragment(a, i, null); }
else mesh = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
const img = rasterTopDown(mesh, { x0, z0, w, h, S, fragment: frag });
const W = img.W, H = img.H;
const rgb = new Uint8Array(W * H * 3);
for (let k = 0; k < W * H; k++) {
  const m = img.mat[k];
  const c = m === 0 ? [20, 20, 20] : PALETTE[m];
  rgb[k * 3] = c[0]; rgb[k * 3 + 1] = c[1]; rgb[k * 3 + 2] = c[2];
}
const put = (i, j, c, a = 1) => { if (i < 0 || j < 0 || i >= W || j >= H) return; const k = (j * W + i) * 3; for (let t = 0; t < 3; t++) rgb[k + t] = rgb[k + t] * (1 - a) + c[t] * a; };
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (i % S === 0 || j % S === 0) put(i, j, [0, 0, 0], 0.35);
const { pos, tri, T } = mesh;
for (let t = 0; t < T; t++) {
  const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
  const area = (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]) - (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3]);
  if (area >= -1e-12) continue;
  for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const ax = (pos[p * 3] - x0) * S, az = (pos[p * 3 + 2] - z0) * S, bx = (pos[q * 3] - x0) * S, bz = (pos[q * 3 + 2] - z0) * S;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let s = 0; s <= n; s++) put(Math.round(ax + (bx - ax) * s / n), Math.round(az + (bz - az) * s / n), [255, 255, 255], 0.2);
  }
}
writePng(out, W, H, rgb);
console.log(out);
if (map) {
  // column tops: material letter and height per column
  const { nx, ny, nz, blocks } = inp;
  const ch = ['.', 'g', 'd', 'S', 's', 'p', 'b', '7'];
  for (let z = z0; z < z0 + h; z++) {
    let row = '';
    for (let x = x0; x < x0 + w; x++) {
      const X = x + inp.apron, Z = z + inp.apron;
      let s = '';
      for (let y = ny - 2; y >= 0; y--) {
        const i = (y * nz + Z) * nx + X, j = i + nx * nz;
        if ((blocks[i] & 0xff) && !(blocks[j] & 0xff)) s += ch[blocks[i] & 0xff] + String(y - inp.apron).padStart(2, '0');
      }
      row += (s || '---').padEnd(4) + ' ';
    }
    console.log(String(z).padStart(3), row);
  }
}
