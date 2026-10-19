// Fast 2-D loop for the flat material scenes: run a per-cell rule directly on
// the plan image (no mesh), rasterise at S px/block, score with the
// harness's own materialMetrics. Usage: node bench2d.mjs <variant> [scenes]
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { materialMetrics } from '../../harness/metrics.mjs';
import { materialImageRgb } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { reconstruct, evalSegments, encodeChords, evalChords, U } from './contour.mjs';
import { xbrDecide, xbrEval, IDX } from './mxlib.mjs';
import { mkdirSync } from 'node:fs';
import { mmpx, mmpxEval } from './mmpx.mjs';

export function runRule2d(scene, cellRule, S = 32) {
  const W = 32, Hh = 32;
  const mat = new Uint8Array(W * S * Hh * S);
  const plan = (x, z) => scene.plan(x, z);
  for (let cz = 0; cz < Hh; cz++) for (let cx = 0; cx < W; cx++) {
    const f = cellRule(plan, cx, cz);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const fx = (i + 0.5) / S + 1.3e-7, fy = (j + 0.5) / S + 0.7e-7;
      mat[(cz * S + j) * W * S + cx * S + i] = f(fx, fy);
    }
  }
  return { W: W * S, H: Hh * S, S, x0: 0, z0: 0, w: W, h: Hh, mat };
}

export const RULES = {
  xbr2: () => (plan, cx, cz) => {
    const nb = new Int8Array(25).fill(U);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) < 4) nb[IDX(dx, dy)] = plan(cx + dx, cz + dy);
    const code = xbrDecide(nb, { corner: 'C' });
    return (fx, fy) => xbrEval(code, nb[12], fx, fy);
  },
  mmpx: () => (plan, cx, cz) => {
    const q = mmpx((dx, dy) => plan(cx + dx, cz + dy));
    return (fx, fy) => mmpxEval(q, fx, fy);
  },
  contour: (o) => (plan, cx, cz) => {
    const R = o.R ?? 8, Sz = 2 * R + 1;
    const img = new Int8Array(Sz * Sz);
    for (let j = 0; j < Sz; j++) for (let i = 0; i < Sz; i++) img[j * Sz + i] = plan(cx - R + i, cz - R + j);
    const e = img[R * Sz + R];
    if (img[(R - 1) * Sz + R] === e && img[(R + 1) * Sz + R] === e && img[R * Sz + R - 1] === e && img[R * Sz + R + 1] === e) return () => e;
    const segs = reconstruct(img, Sz, o);
    if (o.chords) { const code = encodeChords(segs, e, !!o.mid); return (fx, fy) => evalChords(code, e, fx, fy); }
    return (fx, fy) => evalSegments(segs, e, fx, fy);
  },
};

if (process.argv[1].endsWith('bench2d.mjs')) {
  const [variant, only, json] = process.argv.slice(2);
  const o = json ? JSON.parse(json) : {};
  const rule = RULES[variant](o);
  const scenes = MATERIAL_SCENES.filter((s) => s.name !== 'hill-materials' && (!only || only === 'all' || only.split(',').includes(s.name)));
  const out = `${process.cwd()}/work/mx/2d/${variant}`;
  mkdirSync(out, { recursive: true });
  const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—');
  const rows = [];
  for (const sc of scenes) {
    const img = runRule2d(sc, rule);
    const m = materialMetrics(img, sc);
    const worst = m.boundaries.reduce((a, b) => (b.std > (a?.std ?? -1) ? b : a), null);
    const w = m.width ? ` w ${f3(m.width.min)}/${f3(m.width.mean)}` : '';
    rows.push(`${sc.name.padEnd(12)} ${worst ? `${f3(worst.std)} / ${f3(worst.maxDev)} off ${f3(worst.mean)}` : '                 '} area ${f3(m.area.ratio)} parts ${m.components}${m.specks ? '+' + m.specks : ''}${w}`);
    const rgb = materialImageRgb(img, { crop: sc.window });
    writePng(`${out}/${sc.name}.png`, rgb.width, rgb.height, rgb.rgb);
  }
  console.log(rows.join('\n'));
}
