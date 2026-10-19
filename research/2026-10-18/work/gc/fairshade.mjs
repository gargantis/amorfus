// Resolution-independent shading error: area-weighted samples at fixed
// barycentric points inside every in-window triangle, with the normal
// interpolated exactly as the GPU does (linear, then normalised), vs the
// ideal normal at the sample point. Also outline std of cross-sections at
// several heights for mound and pit (plan outlines of curved shapes).
import * as core from '../../harness/core.mjs';
import { GEOMETRY_SCENES, BASE } from '../../harness/scenes.mjs';
import { outlineStats } from '../../harness/metrics.mjs';
const B = [];
for (let i = 0; i <= 6; i++) for (let j = 0; i + j <= 6; j++) { const k = 6 - i - j; B.push([(i + 1 / 3) / 7, (j + 1 / 3) / 7, (k + 1 / 3) / 7]); }
for (const b of B) { const s = b[0] + b[1] + b[2]; b[0] /= s; b[1] /= s; b[2] /= s; }
export function fairShade(m, scene, flat = false) {
  const g = scene.ideal;
  let w2 = 0, ws = 0, mx = 0;
  const fn = [0, 0, 0, 0];
  for (let t = 0; t < m.T; t++) {
    const ids = [m.tri[t * 3], m.tri[t * 3 + 1], m.tri[t * 3 + 2]];
    const c = [0, 1, 2].map((a) => (m.pos[ids[0] * 3 + a] + m.pos[ids[1] * 3 + a] + m.pos[ids[2] * 3 + a]) / 3);
    if (!g.inWindow(c)) continue;
    core.faceNormal(m, t, fn);
    if (fn[3] < 1e-9) continue;
    const flatT = flat || core.vertexIsFlat(m, ids[0]);
    for (const b of B) {
      const p = [0, 1, 2].map((a) => b[0] * m.pos[ids[0] * 3 + a] + b[1] * m.pos[ids[1] * 3 + a] + b[2] * m.pos[ids[2] * 3 + a]);
      let n = flatT ? [fn[0], fn[1], fn[2]] : [0, 1, 2].map((a) => b[0] * m.nrm[ids[0] * 3 + a] + b[1] * m.nrm[ids[1] * 3 + a] + b[2] * m.nrm[ids[2] * 3 + a]);
      const ni = g.normal(p);
      const ang = core.angleDeg(n[0], n[1], n[2], ni[0], ni[1], ni[2]);
      const w = fn[3] / B.length;
      w2 += w * ang * ang; ws += w; mx = Math.max(mx, ang);
    }
  }
  return { rms: Math.sqrt(w2 / ws), max: mx };
}
export function sections(m, scene) {
  if (scene.name === 'mound-r6.4') {
    const C = [16.2, BASE, 15.9], r = 6.4;
    return [1.5, 2.5, 3.5, 4.5].map((h) => outlineStats(m, { y: BASE + h, kind: 'disc', c: [C[0], C[2]], r: Math.sqrt(r * r - h * h), window: [4, 4, 28, 28] }));
  }
  if (scene.name === 'pit-r5.4') {
    const C = [16.2, 10, 15.9], r = 5.4;
    return [0.5, 1.5, 2.5, 3.5].map((h) => outlineStats(m, { y: 10 - h, kind: 'disc', c: [C[0], C[2]], r: Math.sqrt(r * r - h * h), window: [4, 4, 28, 28] }));
  }
  return null;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const names = process.argv.slice(2);
  const scenes = GEOMETRY_SCENES.filter((s) => s.ideal.sdf);
  console.log(['approach', ...scenes.map((s) => s.name), 'mound sections std', 'pit sections std'].join(' | '));
  for (const n of names) {
    const A = await import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href);
    const row = [n];
    const sec = {};
    for (const s of scenes) {
      const m = A.mesh(core.buildRegion(s.cell, A.apron ?? 10), null, core);
      const r = fairShade(m, s, A.flatShading === true);
      row.push(`${r.rms.toFixed(1)}°/${r.max.toFixed(0)}°`);
      const ss = sections(m, s);
      if (ss) sec[s.name] = ss.map((x) => x.std.toFixed(3)).join(',');
    }
    row.push(sec['mound-r6.4'], sec['pit-r5.4']);
    console.log(row.join(' | '));
  }
}
