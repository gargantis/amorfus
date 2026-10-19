// vgn: classify generated chunks (seeds [1,1], [7,7]) by surface type:
// counts of surface corners, cave air (air with solid ≥ 5 above it in its
// column, i.e. below the terrain surface), overhang air (air with solid
// directly within 4 above), and plan height range (cliffs).
//   node work/vgn/survey.mjs > work/vgn/survey.json
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const res = [];
for (const seed of [[1, 1], [7, 7]]) {
  for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) {
    // column of chunks cy = -2..4, stacked
    const col = [];
    for (let cy = -2; cy <= 4; cy++) col.push(buildGenMeshInput(seed, cx, cy, cz, new Map(), { forceApron: 0 }).input.blocks);
    const NY = col.length * 32;
    const solidAt = (x, Y, z) => (col[Y >> 5][((Y & 31) * 32 + z) * 32 + x] & 0xff) !== 0;
    // per chunk stats
    const st = col.map(() => ({ solid: 0, cave: 0, over: 0, surf: 0 }));
    let hmin = Infinity, hmax = -Infinity;
    for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
      let above = 0; // solid count seen so far going down from the top
      let topSurf = null;
      let airRun = 0;
      for (let Y = NY - 1; Y >= 0; Y--) {
        const s = solidAt(x, Y, z);
        const c = Y >> 5;
        if (s) { st[c].solid++; if (topSurf === null) topSurf = Y; above++; airRun = 0; }
        else {
          if (above >= 5) st[c].cave++;
          else if (above > 0) st[c].over++;
          airRun++;
        }
        if (Y + 1 < NY && s !== solidAt(x, Y + 1, z)) st[c].surf++;
      }
      if (topSurf !== null) { hmin = Math.min(hmin, topSurf); hmax = Math.max(hmax, topSurf); }
    }
    st.forEach((s, i) => { if (s.surf > 0) res.push({ seed, c: [cx, i - 2, cz], ...s, hRange: hmax - hmin, hmin: hmin - 64, hmax: hmax - 64 }); });
  }
}
console.log(JSON.stringify(res));
