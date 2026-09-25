// Reviewer check: plan's anisotropic hE (0.15 horizontal, 0.05 vertical; prototype z = vertical)
import { meshChunk, worldPos } from './sn_axis.mjs';
const G1 = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
const base = { k: 6, guard: G1, hAirEditedOnly: true, editedAirRule: 'none', sharpMode: 'axis', hintedLambda: 0 };
const variants = [['hE none', null], ['hE .2 sym (research)', 0.2], ['hE .15/.15/.05 (plan)', [0.15, 0.15, 0.05]]];
const P = (m, x, y, z) => { for (let v = 0; v < m.V; v++) if (m.cx[v] + m.bx0 === x && m.cy[v] + m.by0 === y && m.cz[v] + m.bz0 === z) return worldPos(m, v); return null; };
const steep = (m, x0, x1) => { let worst = 0; for (const q of m.quads) { if (q.sharp) continue; const p = q.v.map(v => worldPos(m, v));
  if (p.some(t => t[0] < x0 || t[0] > x1 || Math.abs(t[1]) > 2)) continue;
  for (const [i, j, k] of [[0,1,2],[0,2,3]]) { const a=p[i],b=p[j],c=p[k]; const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], w=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]]; const L=Math.hypot(...n); if (L<1e-9) continue;
    const ang = Math.acos(Math.abs(n[2])/L)*180/Math.PI; if (n[2] > 0) worst = Math.max(worst, ang); } } return worst; };
for (const mode of ['hinted', 'binary']) {
  for (const [lab, hAir] of variants) {
    const opt = { ...base, hAir };
    const out = [];
    const fh = (x, y, z) => 5.3 - (z + 0.5);
    for (const [tl, D, W, H] of [['1x2', (x, y, z) => x === 0 && (z === 0 || z === 1), 1, 2], ['2x3', (x, y, z) => (x === 0 || x === 1) && z >= 0 && z <= 2, 2, 3]]) {
      const m = meshChunk((x, y, z) => (D(x, y, z) ? 0 : fh(x, y, z) > 0 ? 1 : 0), -6, -6, -6, 12, { ...opt, hint: mode === 'hinted' ? fh : null, edited: D });
      let minW = 9, minH = 9;
      for (let z = 0; z <= H; z++) minW = Math.min(minW, P(m, W, 0, z)[0] - P(m, 0, 0, z)[0]);
      for (let x = 0; x <= W; x++) minH = Math.min(minH, P(m, x, 0, H)[2] - P(m, x, 0, 0)[2]);
      out.push(`dug ${tl} ${minW.toFixed(2)}x${minH.toFixed(2)}`);
    }
    // built 1-block rise: placed smooth blocks on flat ground, x>=0, all y, at z=0 (ground top at z=0 binary / 0.3 hinted)
    const g0 = mode === 'hinted' ? 0.3 : 0.0;
    const f = (x, y, z) => g0 - (z + 0.5) + (mode === 'hinted' ? 0 : 0.5);
    const gnd = (x, y, z) => (f(x, y, z) > 0 ? 1 : 0);
    const rise = (x, y, z) => x >= 0 && z === 0 && !gnd(x, y, z);
    let m = meshChunk((x, y, z) => (rise(x, y, z) || gnd(x, y, z) ? 1 : 0), -6, -6, -6, 12, { ...opt, hint: mode === 'hinted' ? f : null, edited: rise });
    out.push(`built 1-rise steepest ${steep(m, -1.5, 1.5).toFixed(0)}deg`);
    // dug 1-deep step: remove top layer for x>=0 (binary ground top z=0 -> remove z=-1)
    const dig = (x, y, z) => x >= 0 && z === -1;
    m = meshChunk((x, y, z) => (!dig(x, y, z) && gnd(x, y, z) ? 1 : 0), -6, -6, -6, 12, { ...opt, hint: mode === 'hinted' ? f : null, edited: dig });
    out.push(`dug 1-step steepest ${steep(m, -1.5, 1.5).toFixed(0)}deg`);
    console.log(mode.padEnd(7), lab.padEnd(24), out.join(' | '));
  }
}
