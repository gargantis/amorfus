import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { idealDistance } from '../../harness/metrics.mjs';
import { LabelWindow, tracePiece, fitPointel, DEFAULT_FIT, leftPixel, rightPixel, tangentialCover, cornerAt } from './fit2d.mjs';
const name = process.argv[2] ?? 'disc-r7.6';
const scene = MATERIAL_SCENES.find((s) => s.name === name);
const fn = (x, z) => scene.plan(x, z);
const opt = { ...DEFAULT_FIT };
const ideal = scene.ideals[0];
const A = Math.min(...ideal.pair), B = Math.max(...ideal.pair);
const D = 'ESWN';
for (let Z = 4; Z <= 28; Z++) for (let X = 4; X <= 28; X++) for (let d = 0; d < 4; d++) {
  const [lx, lz] = leftPixel(X, Z, d), [rx, rz] = rightPixel(X, Z, d);
  if (fn(lx, lz) !== A || fn(rx, rz) !== B) continue;
  const W = opt.W;
  const lw = new LabelWindow(fn, X - W, Z - W, X + W, Z + W);
  const ch = tracePiece(lw, X, Z, d, A, B, opt.N + opt.Lc + 4);
  const f = fitPointel(ch, ch.start, opt);
  const i = ch.start;
  const lo = Math.max(0, i - opt.N), hi = Math.min(ch.n - 1, i + opt.N - 1);
  const segs = tangentialCover(ch, lo, hi);
  const steps = Array.from(ch.dirs).map((k) => D[k]).join('');
  console.log(`P(${X},${Z}) ${D[d]} n=${ch.n} closed=${ch.closed} start=${i} steps=${steps.slice(0, i)}|${steps.slice(i)} q=(${f?.x.toFixed(3)},${f?.z.toFixed(3)}) corner=${f?.corner} dist=${f ? idealDistance(ideal, [f.x, f.z]).toFixed(3) : '-'} segs=${segs.map((g) => `[${g.s - i},${g.e - i}]`).join('')}`);
}
