import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import * as ap from '../../approaches/mv-fit.mjs';
import { buildContext, cornerPieces, vertexSlots } from './pipeline.mjs';
const [name, x0, x1, z0, z1] = process.argv.slice(2);
const scene = ALL_SCENES.find((s) => s.name === name);
const region = core.buildRegion(scene.cell, ap.apron);
const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
const ctx = buildContext(region, ap.OPT);
const A = region.apron;
const seen = new Set();
for (let v = 0; v < m.V; v++) {
  const cx = m.corner[v * 3], cy = m.corner[v * 3 + 1], cz = m.corner[v * 3 + 2];
  if (cx < +x0 || cx > +x1 || cz < +z0 || cz > +z1) continue;
  const X = cx + A, Y = cy + A, Z = cz + A;
  const px = m.pos[v * 3] + A, pz = m.pos[v * 3 + 2] + A;
  const pieces = cornerPieces(ctx, X, Y, Z, px, pz);
  const sl = vertexSlots(ctx, pieces, m.mat[v], X, Y, Z, px, pz);
  const pinfo = pieces.map((p) => `${p.A}|${p.B} n=${p.pts.length} s=${p.eval(px, pz).s.toFixed(3)}`).join('; ');
  console.log(`v${v} c=(${cx},${cy},${cz}) mat=${m.mat[v]} ${sl ? `s1=${sl.s1.toFixed(3)} s2=${sl.s2.toFixed(3)} o=${sl.o1},${sl.o2} op=${sl.op}` : 'none'} :: ${pinfo}`);
}
