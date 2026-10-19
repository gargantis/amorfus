// VGS visual tools: cross-section profiles (exact slice of the render
// triangles with a vertical plane) and perspective renders, for several
// variants of the same world. Writes PNGs to work/vgs/img/.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../../harness/core.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { VARIANTS } from './phys.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const IMG = join(HERE, 'img');
mkdirSync(IMG, { recursive: true });

export function meshWorld(cellFn, variant, apron = 10) {
  const v = typeof variant === 'string' ? VARIANTS[variant] : variant;
  const region = core.buildRegion(cellFn, apron);
  return core.decodeMesh(v.mesh({ ...region, params: v.params }));
}

/** slice a plain mesh with the plane axis(0=x,2=z) = c → segments [[u0,y0,u1,y1]] in (other horizontal axis, y). */
export function slice(mesh, axis, c) {
  const segs = [];
  const { pos, tri, T } = mesh;
  const ua = axis === 0 ? 2 : 0;
  for (let t = 0; t < T; t++) {
    const P = [tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]].map((v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = P[e], b = P[(e + 1) % 3];
      const da = a[axis] - c, db = b[axis] - c;
      if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
        const f = da / (da - db);
        pts.push([a[ua] + (b[ua] - a[ua]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    if (pts.length === 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
  }
  return segs;
}

/** Plot profiles: { u0,u1,y0,y1, S px/block, cells(u,y) → 0 air | 1 natural | 2 placed, lines: [{segs, rgb}] } */
export function plotProfiles(file, { u0, u1, y0, y1, S = 80, cells, lines, marks = [] }) {
  const W = Math.round((u1 - u0) * S), H = Math.round((y1 - y0) * S);
  const rgb = new Uint8Array(W * H * 3).fill(255);
  const put = (i, j, c, a = 1) => { if (i < 0 || j < 0 || i >= W || j >= H) return; const k = (j * W + i) * 3; for (let q = 0; q < 3; q++) rgb[k + q] = Math.round(rgb[k + q] * (1 - a) + c[q] * a); };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = u0 + (i + 0.5) / S, y = y1 - (j + 0.5) / S;
    const k = cells(Math.floor(u), Math.floor(y));
    if (k === 1) put(i, j, [205, 205, 205]); else if (k === 2) put(i, j, [232, 205, 160]);
    const fu = u - Math.floor(u), fy = y - Math.floor(y);
    if (fu < 1 / S || fy < 1 / S) put(i, j, [150, 150, 150], 0.6);
  }
  const line = (a, b, c, w) => {
    const [ua, ya] = a, [ub, yb] = b;
    const n = Math.ceil(Math.hypot(ub - ua, yb - ya) * S * 2) + 1;
    for (let s = 0; s <= n; s++) {
      const u = ua + ((ub - ua) * s) / n, y = ya + ((yb - ya) * s) / n;
      const ci = (u - u0) * S, cj = (y1 - y) * S;
      for (let di = -w; di <= w; di++) for (let dj = -w; dj <= w; dj++) if (di * di + dj * dj <= w * w) put(Math.round(ci + di), Math.round(cj + dj), c);
    }
  };
  for (const { segs, rgb: c, w = 1 } of lines) for (const s of segs) line([s[0], s[1]], [s[2], s[3]], c, w);
  for (const m of marks) line(m.a, m.b, m.rgb ?? [0, 160, 0], 0);
  writePng(file, W, H, rgb);
  return file;
}

/** side-by-side perspective renders: panels = [{mesh, label}] → one PNG (labels not drawn). */
export function renderPanels(file, panels, cam, { width = 420, height = 300, noao = false } = {}) {
  const imgs = panels.map((p) => {
    if (noao) p.mesh.ao.fill(1);
    return renderShaded(p.mesh, { width, height, ...cam });
  });
  const gap = 6;
  const W = imgs.length * width + (imgs.length - 1) * gap, H = height;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  imgs.forEach((im, k) => {
    for (let j = 0; j < H; j++) for (let i = 0; i < width; i++) for (let q = 0; q < 3; q++) rgb[(j * W + k * (width + gap) + i) * 3 + q] = im.rgb[(j * width + i) * 3 + q];
  });
  writePng(file, W, H, rgb);
  return file;
}

/** steepest walkable-relevant slope along a profile: max |dy/du| over segments whose y lies in [ya, yb]. */
export function steepest(segs, ya, yb) {
  let best = 0;
  for (const [ua, y0, ub, y1] of segs) {
    if (Math.max(y0, y1) < ya || Math.min(y0, y1) > yb) continue;
    const du = Math.abs(ub - ua), dy = Math.abs(y1 - y0);
    if (du + dy < 1e-6) continue;
    const ang = (Math.atan2(dy, du) * 180) / Math.PI;
    if (ang > best) best = ang;
  }
  return best;
}
