// Classify quad-edge steps of mv-quad on bench chunks by the two quads' choice kinds.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import * as M from '../../approaches/mv-quad.mjs';
M.OPT.debugQuads = 1; M.OPT.conf = Number(process.env.CONF ?? 1);
const NS = 16;
const trans = (s) => { const t = []; for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) t.push(i); return t; };
const agree = (a, b) => { const ta = trans(a), tb = trans(b); if (ta.length !== tb.length) return false; for (let i = 0; i < ta.length; i++) if (Math.abs(ta[i] - tb[i]) > 1) return false; return true; };
const q = (v) => Math.round(v * 256);
const hist = new Map();
for (const c of [[-1, 1, 1], [0, 0, -3], [1, 0, 0], [-2, 1, 2]]) {
  const m = M.mesh(buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input, null, core);
  const tmp = new Float64Array(2), info = { a: 0, ownMat: 0 };
  const edges = new Map();
  for (let t = 0; t < m.T; t++) {
    const vs = [m.tri[t * 3], m.tri[t * 3 + 1], m.tri[t * 3 + 2]];
    for (let e = 0; e < 3; e++) {
      const i = e, j = (e + 1) % 3;
      const P = (v) => `${q(m.pos[v * 3])},${q(m.pos[v * 3 + 1])},${q(m.pos[v * 3 + 2])}`;
      const ka = P(vs[i]), kb = P(vs[j]); const fwd = ka < kb;
      const key = fwd ? `${ka}|${kb}` : `${kb}|${ka}`;
      let s = '';
      for (let n = 0; n < NS; n++) {
        let u = (n + 0.5) / NS; if (!fwd) u = 1 - u;
        const w = [0, 0, 0]; w[i] = 1 - u; w[j] = u;
        for (let d = 0; d < 2; d++) tmp[d] = w[0] * m.attrs[vs[0] * 2 + d] + w[1] * m.attrs[vs[1] * 2 + d] + w[2] * m.attrs[vs[2] * 2 + d];
        info.a = vs[0]; info.ownMat = m.mat[vs[0]];
        s += M.fragment(tmp, info);
      }
      const l = edges.get(key); const rec = { s, quad: t >> 1, mat: m.mat[vs[0]], axis: m.quadAxis[t >> 1] };
      if (l) l.push(rec); else edges.set(key, [rec]);
    }
  }
  for (const l of edges.values()) {
    if (l.length !== 2 || agree(l[0].s, l[1].s)) continue;
    const k = [m.quadInfo[l[0].quad], m.quadInfo[l[1].quad]].sort().join('/') + (l[0].mat === l[1].mat ? ' same-mat' : ' diff-mat') + ` axes ${[l[0].axis, l[1].axis].sort().join('')}`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
    if (process.env.SHOWPOS && k.startsWith('1/1 same-mat axes 11') && (hist.get(k) <= 6)) console.log('  ', c.join(','), l[0].s, l[1].s, [...edges.entries()].find(([kk, vv]) => vv === l)[0]);
  }
}
for (const [k, v] of [...hist].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k);
