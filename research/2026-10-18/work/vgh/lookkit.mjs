// VGH look kit: meshes for any variant of work/vgh/phys.mjs, shaded with
// gn-best's AO (work/gh/gnao.mjs post-pass, byte-identical to gn's AO per the
// gh team) on EVERY panel so geometry is judged without block-shaped AO
// bands; exact slice profiles; surface height at a point.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { VARIANTS } from './phys.mjs';
import { withGnAo } from '../gh/gnao.mjs';
import { slice, plotProfiles, IMG } from './viz.mjs';
export { IMG, slice, plotProfiles };

export const COL = { cubes: [120, 120, 120], hints: [0, 90, 200], 'gs-ctx': [0, 160, 0], 'gh-cc8b': [210, 30, 30], 'gh-noCliffY': [200, 120, 0], 'gh-R12': [150, 0, 150] };

export function meshOf(fn, v, { ao = 'gn', apron = 10 } = {}) {
  const V = VARIANTS[v];
  const region = core.buildRegion(fn, apron);
  const m = core.decodeMesh(V.mesh({ ...region, params: V.params }));
  if (ao === 'gn') withGnAo(m, region);
  else if (ao === 'none') m.ao.fill(1);
  return m;
}

/** side-by-side perspective panels (left → right = vars). */
export function panels(file, fn, vars, cam, { width = 400, height = 280, ao = 'gn', meshes = null } = {}) {
  const imgs = vars.map((v, k) => renderShaded(meshes ? meshes[k] : meshOf(fn, v, { ao }), { width, height, ...cam }));
  const gap = 6;
  const W = imgs.length * width + (imgs.length - 1) * gap, H = height;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  imgs.forEach((im, k) => {
    for (let j = 0; j < H; j++) for (let i = 0; i < width; i++) for (let q = 0; q < 3; q++) rgb[(j * W + k * (width + gap) + i) * 3 + q] = im.rgb[(j * width + i) * 3 + q];
  });
  writePng(file, W, H, rgb);
  return file;
}

/** stack several panel PNG rows vertically: rows = [[mesh...]...] */
export function grid(file, rows, cam, { width = 360, height = 250 } = {}) {
  const imgs = rows.map((r) => r.map((m) => renderShaded(m, { width, height, ...cam })));
  const gap = 6;
  const nc = Math.max(...rows.map((r) => r.length));
  const W = nc * width + (nc - 1) * gap, H = rows.length * height + (rows.length - 1) * gap;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  imgs.forEach((row, rj) => row.forEach((im, k) => {
    for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) for (let q = 0; q < 3; q++) rgb[((rj * (height + gap) + j) * W + k * (width + gap) + i) * 3 + q] = im.rgb[(j * width + i) * 3 + q];
  }));
  writePng(file, W, H, rgb);
  return file;
}

/** highest surface y over (u) on the vertical slice plane axis = c (axis 2: plane z = c, u = x; axis 0: plane x = c, u = z). */
export function heightAt(mesh, axis, c, u, segs = null) {
  const S = segs ?? slice(mesh, axis, c);
  let best = -Infinity;
  for (const [u0, y0, u1, y1] of S) {
    const lo = Math.min(u0, u1), hi = Math.max(u0, u1);
    if (lo <= u && hi >= u && hi > lo) { const y = y0 + ((y1 - y0) * (u - u0)) / (u1 - u0); if (y > best) best = y; }
  }
  return best;
}
export const f3 = (v) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(3) : String(v));
