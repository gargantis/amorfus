// vgn: shading creases on flat geometry — mesh edges whose two triangles are
// coplanar (face normals within 5°) but whose endpoint shading normals
// differ by > 25° (a visible shading line not present in the geometry).
// Harness built scenes + vgn thin scenes, production vs gn-best.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { THIN } from './thin-scenes.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
function creases(m) {
  const fn = [0, 0, 0, 0], fn2 = [0, 0, 0, 0];
  const edges = new Map();
  const qk = (v) => `${Math.round(m.pos[v * 3] * 256)},${Math.round(m.pos[v * 3 + 1] * 256)},${Math.round(m.pos[v * 3 + 2] * 256)}`;
  for (let t = 0; t < m.T; t++) for (let e = 0; e < 3; e++) {
    const a = m.tri[t * 3 + e], b = m.tri[t * 3 + ((e + 1) % 3)];
    const ka = qk(a), kb = qk(b);
    const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const l = edges.get(k); if (l) l.push([t, a, b]); else edges.set(k, [[t, a, b]]);
  }
  let flat = 0, bad = 0, worst = 0;
  for (const l of edges.values()) {
    if (l.length !== 2) continue;
    core.faceNormal(m, l[0][0], fn); core.faceNormal(m, l[1][0], fn2);
    if (core.angleDeg(fn[0], fn[1], fn[2], fn2[0], fn2[1], fn2[2]) > 5) continue;
    const [, a, b] = l[0];
    if ((m.flags[a] | m.flags[b]) & 3) continue;
    flat++;
    const ang = core.angleDeg(m.nrm[a * 3], m.nrm[a * 3 + 1], m.nrm[a * 3 + 2], m.nrm[b * 3], m.nrm[b * 3 + 1], m.nrm[b * 3 + 2]);
    if (ang > 25) bad++;
    if (ang > worst) worst = ang;
  }
  return { flat, bad, worst };
}
const scenes = [...ALL_SCENES.filter((s) => s.kind !== 'material' && s.name !== 'hinted-slope-1:4' && s.name !== 'hinted-hill'), ...THIN];
let tp = 0, tg = 0;
for (const s of scenes) {
  const region = core.buildRegion(s.cell, 10);
  const a = creases(core.decodeMesh(repoMesh({ ...region, params: {} })));
  const b = creases(core.decodeMesh(gnMesh({ ...region, params: PARAMS })));
  tp += a.bad; tg += b.bad;
  if (a.bad || b.bad) console.log(`${s.name.padEnd(20)} flat edges ${a.flat}: >25° prod ${a.bad} (worst ${a.worst.toFixed(0)}°) → gn ${b.bad} (worst ${b.worst.toFixed(0)}°)`);
}
console.log(`total shading creases on flat geometry: prod ${tp} → gn ${tg}`);
