import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { idealDistance } from '../../harness/metrics.mjs';
import { LabelWindow, tracePiece, fitPointel, DEFAULT_FIT, DX, DZ, leftPixel, rightPixel } from './fit2d.mjs';
import { stats } from '../../harness/core.mjs';
const args = process.argv.slice(2);
const opt = { ...DEFAULT_FIT };
for (const a of args) { const [k, v] = a.split('='); if (k in opt) opt[k] = Number(v); }
const only = args.find((a) => a.startsWith('only='))?.slice(5).split(',');
for (const scene of MATERIAL_SCENES) {
  if (only && !only.includes(scene.name)) continue;
  if (scene.name === 'hill-materials') continue;
  const fn = (x, z) => scene.plan(x, z);
  const out = [];
  for (const ideal of scene.ideals) {
    const [A0, B0] = ideal.pair;
    const A = Math.min(A0, B0), B = Math.max(A0, B0);
    const ds = [];
    let corners = 0;
    for (let Z = 4; Z <= 28; Z++) for (let X = 4; X <= 28; X++) for (let d = 0; d < 4; d++) {
      const [lx, lz] = leftPixel(X, Z, d), [rx, rz] = rightPixel(X, Z, d);
      if (fn(lx, lz) !== A || fn(rx, rz) !== B) continue;
      const W = opt.W;
      const lw = new LabelWindow(fn, X - W, Z - W, X + W, Z + W);
      const ch = tracePiece(lw, X, Z, d, A, B, opt.N + opt.Lc + 4);
      const f = fitPointel(ch, ch.start, opt);
      if (!f) continue;
      if (f.kind === "corner") corners++;
      const p = [f.x, f.z];
      // window / ray filter like the metric
      if (ideal.window) { const [a, b, c, e] = ideal.window; if (p[0] < a || p[0] > c || p[1] < b || p[1] > e) continue; }
      if (ideal.ray) { const { c, dir, min } = ideal.ray; if ((p[0] - c[0]) * Math.cos(dir) + (p[1] - c[1]) * Math.sin(dir) < min) continue; }
      ds.push(idealDistance(ideal, p));
    }
    const s = stats(ds);
    out.push(`${ideal.label}: n ${s.n} std ${s.std?.toFixed(4)} max ${s.maxDev?.toFixed(4)} off ${s.mean?.toFixed(3)} corners ${corners}`);
  }
  console.log(scene.name.padEnd(12), out.join(' | '));
}
