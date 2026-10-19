// vmv: where the boundary steps at shared up-facing edges (mv-quad), for one
// case of qsteps.mjs: prints edge midpoints and step sizes; renders a zoom.
//   node work/vmv/qsteps-where.mjs <case> x0 z0 x1 z1 S out.png
import { join } from 'node:path';
import { ADV_SCENES } from '../vmf/adv-scenes.mjs';
import { core, flatGround, loadApproach, plan, zoomRgb, hcat, save, ROOT } from './vlib.mjs';
const { GRASS, STONE, PLANKS } = core;
const CASES = {
  'line13': flatGround((x, z) => (x >= 3 && x < 29 && z === 9 + Math.round((x - 3) / 3) ? STONE : GRASS)),
  'loop': flatGround((x, z) => { const d = Math.hypot(x + 0.5 - 16, z + 0.5 - 16); return d > 6.5 && d < 8 ? PLANKS : STONE; }),
  'text': ADV_SCENES.find((s) => s.name === 'pixel-text').cell,
};
const [name, x0, z0, x1, z1, S, out] = process.argv.slice(2);
const A = await loadApproach('approaches/mv-quad.mjs');
const H = await loadApproach('approaches/hints.mjs');
const cell = CASES[name];
const m = A.mesh(core.buildRegion(cell, 10), null, core);
const NS = 32, q = (v) => Math.round(v * 256);
const trans = (s) => { const t = []; for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) t.push(i); return t; };
const map = new Map();
const tmp = new Float64Array(2), info = { a: 0, ownMat: 0 };
for (let t = 0; t < m.T; t++) {
  const vs = [m.tri[t * 3], m.tri[t * 3 + 1], m.tri[t * 3 + 2]];
  const p = m.pos;
  const area = (p[vs[1] * 3] - p[vs[0] * 3]) * (p[vs[2] * 3 + 2] - p[vs[0] * 3 + 2]) - (p[vs[1] * 3 + 2] - p[vs[0] * 3 + 2]) * (p[vs[2] * 3] - p[vs[0] * 3]);
  if (area >= -1e-12) continue;
  for (let e = 0; e < 3; e++) {
    const i = e, j = (e + 1) % 3;
    const P = (v) => `${q(p[v * 3])},${q(p[v * 3 + 1])},${q(p[v * 3 + 2])}`;
    const ka = P(vs[i]), kb = P(vs[j]), fwd = ka < kb, key = fwd ? `${ka}|${kb}` : `${kb}|${ka}`;
    let s = '';
    for (let n = 0; n < NS; n++) {
      let u = (n + 0.5) / NS; if (!fwd) u = 1 - u;
      const w = [0, 0, 0]; w[i] = 1 - u; w[j] = u;
      for (let d = 0; d < 2; d++) tmp[d] = w[0] * m.attrs[vs[0] * 2 + d] + w[1] * m.attrs[vs[1] * 2 + d] + w[2] * m.attrs[vs[2] * 2 + d];
      info.a = vs[0]; info.ownMat = m.mat[vs[0]];
      s += A.fragment(tmp, info);
    }
    const mid = [(p[vs[i] * 3] + p[vs[j] * 3]) / 2, (p[vs[i] * 3 + 2] + p[vs[j] * 3 + 2]) / 2];
    const l = map.get(key); if (l) l.list.push(s); else map.set(key, { list: [s], mid });
  }
}
const bad = [];
for (const { list, mid } of map.values()) {
  if (list.length !== 2) continue;
  const ta = trans(list[0]), tb = trans(list[1]);
  let ok = ta.length === tb.length, mx = 0;
  if (ok) for (let i = 0; i < ta.length; i++) mx = Math.max(mx, Math.abs(ta[i] - tb[i]));
  if (!ok || mx > 1) bad.push(`(${mid[0].toFixed(2)},${mid[1].toFixed(2)}) ${ok ? (mx / NS).toFixed(2) : 'tear'} ${list[0]} ${list[1]}`);
}
console.log(`${bad.length} stepping edges:\n` + bad.join('\n'));
if (x0 !== undefined) {
  const win = [+x0, +z0, +x1, +z1];
  const a = plan(H, cell, win, +S), b = plan(A, cell, win, +S);
  save(join(ROOT, 'out', 'vmv-adv', out), hcat([zoomRgb(a.img, a.m), zoomRgb(b.img, b.m)], 8));
}
