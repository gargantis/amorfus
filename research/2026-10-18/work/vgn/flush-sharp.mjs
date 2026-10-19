// vgn: a flush SHARP floor (brick, replacing the generated top solid layer)
// in hinted flat ground whose surface sits at BASE + f. Sharp values are
// always shape edits, so their partial volume jumps to occupancy 1 while the
// generated top layer had ½ + f. Mean AO on the floor vs open ground.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { AIR, GRASS, DIRT, BRICK, SHARP_BIT } from '../../harness/core.mjs';
for (const f of [0.55, 0.7, 0.9]) {
  const top = 6 + f; // surface height; block 6 is solid with centre density f − 0.5
  const cell = (x, y, z) => {
    const d = top - (y + 0.5);
    if (d <= 0) return { v: AIR, rho: clampRho(d) };
    if (y === 6 && x >= 13 && x < 19 && z >= 13 && z < 19) return { v: BRICK | SHARP_BIT, edited: true };
    return { v: y === 6 ? GRASS : DIRT, rho: clampRho(d) };
  };
  const r = core.buildRegion(cell, 10);
  for (const [k, m] of [['prod', core.decodeMesh(repoMesh({ ...r, params: {} }))], ['gn', core.decodeMesh(gnMesh({ ...r, params: PARAMS }))]]) {
    let fl = 0, nf = 0, op = 0, no = 0, mn = 1;
    for (let v = 0; v < m.V; v++) {
      const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2];
      if (y < 6.5) continue;
      if (x > 13.2 && x < 18.8 && z > 13.2 && z < 18.8) { fl += m.ao[v]; nf++; mn = Math.min(mn, m.ao[v]); }
      else if (Math.max(Math.abs(x - 16), Math.abs(z - 16)) > 7) { op += m.ao[v]; no++; }
    }
    console.log(`surface +${f}: ${k} floor AO mean ${(fl / nf).toFixed(3)} (min ${mn.toFixed(3)}) vs open ground ${(op / no).toFixed(3)}`);
  }
}
