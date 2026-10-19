import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { idealDistance } from '../../harness/metrics.mjs';
import { LabelWindow, tracePiece, fitPointel, DEFAULT_FIT, leftPixel, rightPixel } from './fit2d.mjs';
const name = process.argv[2] ?? 'disc-r7.6';
const scene = MATERIAL_SCENES.find((s) => s.name === name);
const fn = (x, z) => scene.plan(x, z);
const opt = { ...DEFAULT_FIT };
for (const a of process.argv.slice(3)) { const [k, v] = a.split('='); opt[k] = Number(v); }
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
  const steps = Array.from(ch.dirs).map((k) => D[k]).join('');
  const cv = f?.curve;
  let circ = '';
  if (cv && cv.k !== 0) {
    const cx = cv.ox - cv.wx / cv.k, cz = cv.oz - cv.wz / cv.k;
    const R = Math.sqrt((cv.wx * cv.wx + cv.wz * cv.wz) / (cv.k * cv.k) - 2 * cv.c / cv.k);
    circ = `C=(${cx.toFixed(2)},${cz.toFixed(2)}) R=${R.toFixed(2)} t=${cv.t?.toFixed(3)}`;
  }
  console.log(`P(${X},${Z}) ${steps.slice(Math.max(0, i - 8), i)}|${steps.slice(i, i + 8)} ${f?.kind} q=(${f?.x.toFixed(2)},${f?.z.toFixed(2)}) dist=${f ? idealDistance(ideal, [f.x, f.z]).toFixed(3) : '-'} ${circ}`);
}
