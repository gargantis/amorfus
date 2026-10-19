// Per-pointel fits of a scene's plan map in a box: node work/mv/dbg-fits.mjs scene x0 x1 z0 z1 [k=v]
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { LabelWindow, tracePiece, fitPointel, cornerAt, DEFAULT_FIT, leftPixel, rightPixel } from './fit2d.mjs';
import { DEFAULT_PIPE } from './pipeline.mjs';
const [name, x0, x1, z0, z1, ...rest] = process.argv.slice(2);
const scene = MATERIAL_SCENES.find((s) => s.name === name);
const fn = (x, z) => scene.plan(x, z);
const opt = { ...DEFAULT_PIPE };
for (const a of rest) { const [k, v] = a.split('='); opt[k] = Number(v); }
const D = 'ESWN';
for (let Z = +z0; Z <= +z1; Z++) for (let X = +x0; X <= +x1; X++) for (let d = 0; d < 4; d++) {
  const [lx, lz] = leftPixel(X, Z, d), [rx, rz] = rightPixel(X, Z, d);
  const l = fn(lx, lz), r = fn(rx, rz);
  if (l === r || l > r) continue;
  const W = opt.W;
  const lw = new LabelWindow(fn, X - W, Z - W, X + W, Z + W);
  const ch = tracePiece(lw, X, Z, d, l, r, opt.N + opt.Lc + 4);
  const f = fitPointel(ch, ch.start, opt);
  const i = ch.start;
  const c = cornerAt(ch, i, opt);
  const steps = Array.from(ch.dirs).map((k) => D[k]).join('');
  console.log(`P(${X},${Z}) ${D[d]} ${l}|${r} ${steps.slice(Math.max(0, i - 10), i)}|${steps.slice(i, i + 10)} ${f?.kind}${c ? (c.cap ? ' CAP' : ' CORNER') : ''} q=(${f?.x.toFixed(2)},${f?.z.toFixed(2)}) t=(${f?.tx.toFixed(2)},${f?.tz.toFixed(2)})`);
}
