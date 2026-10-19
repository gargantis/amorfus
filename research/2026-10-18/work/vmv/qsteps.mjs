// vmv: boundary steps at shared triangle edges on PLAYER paint (flat hinted
// grass). Same criterion as work/mv/edgecont.mjs (16 samples per edge from
// each incident triangle; the two sides disagree if their material
// transitions differ in count or by > 1 sample), restricted to up-facing
// triangles, and with the step size measured in blocks along the edge.
//   node work/vmv/qsteps.mjs [approaches/x.mjs]
import { ADV_SCENES } from '../vmf/adv-scenes.mjs';
import { core, flatGround, loadApproach, setPlan } from './vlib.mjs';
const { GRASS, STONE, SAND, PLANKS } = core;
const NS = 32;
const q = (v) => Math.round(v * 256);
const trans = (s) => { const t = []; for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) t.push(i); return t; };
export function edgeSteps(m, frag) {
  const out = new Map();
  const dim = m.attrDim ?? 0, tmp = new Float64Array(Math.max(1, dim));
  const info = { t: 0, a: 0, b: 0, c: 0, quad: 0, w: [0, 0, 0], x: 0, y: 0, z: 0, ownMat: 0 };
  const { pos, tri } = m;
  for (let t = 0; t < m.T; t++) {
    const vs = [tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]];
    const area = (pos[vs[1] * 3] - pos[vs[0] * 3]) * (pos[vs[2] * 3 + 2] - pos[vs[0] * 3 + 2]) - (pos[vs[1] * 3 + 2] - pos[vs[0] * 3 + 2]) * (pos[vs[2] * 3] - pos[vs[0] * 3]);
    if (area >= -1e-12) continue;
    for (let e = 0; e < 3; e++) {
      const i = e, j = (e + 1) % 3, k = (e + 2) % 3;
      const P = (v) => `${q(pos[v * 3])},${q(pos[v * 3 + 1])},${q(pos[v * 3 + 2])}`;
      const ka = P(vs[i]), kb = P(vs[j]);
      const fwd = ka < kb;
      const key = fwd ? `${ka}|${kb}` : `${kb}|${ka}`;
      const len = Math.hypot(pos[vs[i] * 3] - pos[vs[j] * 3], pos[vs[i] * 3 + 2] - pos[vs[j] * 3 + 2]);
      let s = '';
      for (let n = 0; n < NS; n++) {
        let u = (n + 0.5) / NS; if (!fwd) u = 1 - u;
        const w = [0, 0, 0]; w[i] = 1 - u; w[j] = u; w[k] = 0;
        for (let d = 0; d < dim; d++) tmp[d] = w[0] * m.attrs[vs[0] * dim + d] + w[1] * m.attrs[vs[1] * dim + d] + w[2] * m.attrs[vs[2] * dim + d];
        info.t = t; info.a = vs[0]; info.b = vs[1]; info.c = vs[2]; info.ownMat = m.mat[vs[0]];
        s += frag ? frag(tmp, info) : m.mat[vs[0]];
      }
      const l = out.get(key); if (l) l.list.push(s); else out.set(key, { list: [s], len });
    }
  }
  let shared = 0, withB = 0, bad = 0, big = 0, maxStep = 0;
  for (const { list, len } of out.values()) {
    if (list.length !== 2) continue;
    shared++;
    if (new Set((list[0] + list[1]).split('')).size > 1) withB++;
    const ta = trans(list[0]), tb = trans(list[1]);
    let ok = ta.length === tb.length;
    let mx = 0;
    if (ok) for (let i = 0; i < ta.length; i++) mx = Math.max(mx, Math.abs(ta[i] - tb[i]));
    if (!ok || mx > 1) {
      bad++;
      const stepBlocks = ok ? (mx / NS) * len : len; // a missing/extra transition counts as a full-edge step
      if (stepBlocks > 0.1) big++;
      maxStep = Math.max(maxStep, stepBlocks);
    }
  }
  return { shared, withB, bad, big, maxStep };
}
if (process.argv[1].endsWith('qsteps.mjs')) {
  const A = await loadApproach(process.argv[2] ?? 'approaches/mv-quad.mjs');
  const disc = (cx, cz, r, m) => (x, z) => ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r * r ? m : GRASS);
  const blob = (x, z) => { const u = x + 0.5 - 16, v = z + 0.5 - 16; const a = Math.atan2(v, u); const r = 6 + 1.6 * Math.sin(3 * a) + 0.9 * Math.cos(5 * a + 1); return u * u + v * v <= r * r ? STONE : GRASS; };
  const CASES = [
    ['disc r6.3 stone', flatGround(disc(16.2, 15.8, 6.3, STONE))],
    ['organic blob', flatGround(blob)],
    ['two-material blob (sand ring)', flatGround((x, z) => { const d = Math.hypot(x + 0.5 - 16, z + 0.5 - 16); return d < 4 ? STONE : d < 7 ? SAND : GRASS; })],
    ['line 1:3 1-wide', flatGround((x, z) => (x >= 3 && x < 29 && z === 9 + Math.round((x - 3) / 3) ? STONE : GRASS))],
    ['line 1:1 1-wide', flatGround((x, z) => (x >= 3 && x < 29 && z === x ? STONE : GRASS))],
    ['pixel-text', ADV_SCENES.find((s) => s.name === 'pixel-text').cell],
    ['stripes-12', ADV_SCENES.find((s) => s.name === 'stripes-12').cell],
    ['lines-Tdiag', ADV_SCENES.find((s) => s.name === 'lines-Tdiag').cell],
    ['corner3', ADV_SCENES.find((s) => s.name === 'corner3').cell],
    ['planks path loop on stone', flatGround((x, z) => { const d = Math.hypot(x + 0.5 - 16, z + 0.5 - 16); return d > 6.5 && d < 8 ? PLANKS : STONE; })],
  ];
  console.log(`${A.name}: up-facing shared edges | edges with a material change | edges where the boundary steps (any) | steps > 0.1 block | max step (blocks)`);
  for (const [label, cell] of CASES) {
    const m = A.mesh(core.buildRegion(cell, A.apron ?? 10), null, core);
    const r = edgeSteps(m, A.fragment ? (a, i) => A.fragment(a, i, null) : null);
    console.log(`${label}: ${r.shared} | ${r.withB} | ${r.bad} (${(100 * r.bad / Math.max(1, r.withB)).toFixed(1)} %) | ${r.big} | ${r.maxStep.toFixed(2)}`);
  }
}
