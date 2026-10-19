// vgn: edit-zone normals on thin and awkward builds. Same geometry under
// production and gn-best; per triangle-vertex pair, the shading normal vs the
// triangle's own face normal: "inverted" = dot < 0 (the fragment is lit as if
// facing away), "> 60°" = dot < 0.5. Triplanar wrong-plane area (production
// shader weights pow(|n|,4)): vertical faces with w.y > 0.3 (top texture
// smeared down a wall); also the sun-lit difference.
//   node work/vgn/thin.mjs [--img] [only]
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { THIN } from './thin-scenes.mjs';
import { CHECKS } from '../gn/aocheck-scenes.mjs';
import { renderRow } from './world.mjs';
import { mkdirSync } from 'node:fs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const img = args.includes('--img');
const only = args.find((a) => !a.startsWith('--'));
export function normalStats(m) {
  const fn = [0, 0, 0, 0];
  let pairs = 0, inv = 0, off60 = 0, vertA = 0, wrongTop = 0, horizA = 0, wrongSide = 0, angSum = 0, areaSum = 0;
  const invTris = new Set();
  for (let t = 0; t < m.T; t++) {
    core.faceNormal(m, t, fn);
    const area = fn[3];
    if (!(area > 1e-9)) continue;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      const v = m.tri[t * 3 + k];
      if (m.flags[v] & 3) continue; // flat-shaded vertex: uses the face normal
      const d = m.nrm[v * 3] * fn[0] + m.nrm[v * 3 + 1] * fn[1] + m.nrm[v * 3 + 2] * fn[2];
      pairs++;
      if (d < 0) { inv++; invTris.add(t); }
      if (d < 0.5) off60++;
      angSum += Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI * area;
      areaSum += area;
      cx += m.nrm[v * 3]; cy += m.nrm[v * 3 + 1]; cz += m.nrm[v * 3 + 2];
    }
    const l = Math.hypot(cx, cy, cz);
    if (l < 1e-9) continue;
    const ax = Math.abs(cx / l) ** 4, ay = Math.abs(cy / l) ** 4, az = Math.abs(cz / l) ** 4;
    const wy = ay / (ax + ay + az);
    if (Math.abs(fn[1]) < 0.15) { vertA += area; if (wy > 0.3) wrongTop += area; }
    if (Math.abs(fn[1]) > 0.95) { horizA += area; if (wy < 0.5) wrongSide += area; }
  }
  return { pairs, inv, invTris: invTris.size, off60, meanAng: angSum / areaSum, wrongTop: vertA ? wrongTop / vertA : 0, wrongSide: horizA ? wrongSide / horizA : 0 };
}
const scenes = [...THIN, ...CHECKS.filter((c) => c.name === 'overhang' || c.name === 'gap-1-high')];
console.log('scene | pairs | inverted (dot<0) prod→gn | >60° prod→gn | mean angle to face prod→gn | wall area w/ top texture >0.3 prod→gn | top area w/ side texture prod→gn');
for (const s of scenes) {
  if (only && !s.name.includes(only)) continue;
  const region = core.buildRegion(s.cell, 10);
  const P = core.decodeMesh(repoMesh({ ...region, params: {} }));
  const G = core.decodeMesh(gnMesh({ ...region, params: PARAMS }));
  const a = normalStats(P), b = normalStats(G);
  const pc = (x) => (100 * x).toFixed(1) + '%';
  console.log(`${s.name.padEnd(20)} | ${a.pairs} | ${a.inv}→${b.inv} (${a.invTris}→${b.invTris} tris) | ${a.off60}→${b.off60} | ${a.meanAng.toFixed(1)}°→${b.meanAng.toFixed(1)}° | ${pc(a.wrongTop)}→${pc(b.wrongTop)} | ${pc(a.wrongSide)}→${pc(b.wrongSide)}`);
  if (img) renderRow(`${OUT}${s.name}.png`, [P, G], { ...s.camera, fov: 55, width: 480, height: 340 });
}
