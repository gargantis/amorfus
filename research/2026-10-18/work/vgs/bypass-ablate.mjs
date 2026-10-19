// Which gs ingredient opens the tall-foot bypass? Scenes A and D of bypass-sweep.mjs
// under gs variants with one ingredient switched off.
import { MeshWorld, run, spawn, natural, placed, yawTo, VARIANTS } from './phys.mjs';
import { meshRegion as gsMesh } from '../gs/mesher-gs.mjs';
import { params as ctx } from '../../approaches/gs-ctx.mjs';
import { params as mls } from '../../approaches/gs-mls.mjs';
const V = {
  'gs-ctx': { mesh: gsMesh, params: ctx },
  'gs-ctx rDilate0': { mesh: gsMesh, params: { ...ctx, rDilate: 0 } },
  'gs-ctx editMid off': { mesh: gsMesh, params: { ...ctx, editMid: false } },
  'gs-ctx capMode d3': { mesh: gsMesh, params: { ...ctx, capMode: 'd3' } },
  'gs-mls': { mesh: gsMesh, params: mls },
  'gs-mls rDilate0': { mesh: gsMesh, params: { ...mls, rDilate: 0 } },
  'gs-mls capMode d3': { mesh: gsMesh, params: { ...mls, capMode: 'd3' } },
};
const PH = [-0.45, -0.35, -0.25, -0.15, -0.05, 0, 0.05, 0.15, 0.25, 0.35, 0.45];
const sc = {
  A: (ph) => (x, y) => (x >= 12 && y === 9 ? placed() : natural(y, 8 + ph + (x + 0.5 >= 12 ? 1 : 0))),
  D: (ph) => (x, y, z) => (x + z >= 28 && y === 9 ? placed() : natural(y, 8 + ph + (x + z + 1 >= 28 ? 1 : 0))),
};
for (const [k, mk] of Object.entries(sc)) {
  for (const [vn, variant] of Object.entries(V)) {
    let n = 0;
    for (const ph of PH) {
      const w = new MeshWorld(mk(ph), variant).build(0, 0, 0);
      let up = 0;
      const tries = k === 'D' ? [[{ move: [0, 1], yaw: yawTo(1, 1) }, 8.5, 8.5], [{ move: [0, 1], yaw: yawTo(1, 1), sprint: true }, 8.5, 8.5]] : [[{ move: [0, 1], yaw: -Math.PI / 2 }, 5.5, 16.5], [{ move: [0, 1], yaw: -Math.PI / 2, sprint: true }, 5.5, 16.5]];
      for (const [inp, x0, z0] of tries) {
        const r = run(w, spawn(x0, 9.2 + ph, z0), inp, 4, { probe: false });
        if (k === 'D' ? r.s.position[0] + r.s.position[2] > 29.5 : r.s.position[0] > 12.6) up++;
      }
      if (up > 0) n++;
    }
    console.log(`scene ${k} ${vn.padEnd(20)} walkable at ${n}/${PH.length} phases`);
  }
}
