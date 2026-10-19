// Pieces at one terrain corner: node work/mv/tpieces.mjs <module> cx,cy,cz X Y Z
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const [mp, cs, X, Y, Z] = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(mp)).href);
const P = await import(pathToFileURL(resolve(mod.PIPE ?? 'work/mv/pipe5.mjs')).href);
const inp = buildGenMeshInput([1, 1], ...cs.split(',').map(Number), new Map(), { forceApron: mod.apron ?? 10 }).input;
const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
const A = inp.apron;
let v0 = -1;
for (let v = 0; v < m.V; v++) if (m.corner[v * 3] === +X && m.corner[v * 3 + 1] === +Y && m.corner[v * 3 + 2] === +Z) { v0 = v; break; }
const ox = m.pos[v0 * 3] - +X, oz = m.pos[v0 * 3 + 2] - +Z;
const ctx = P.buildContext(inp, mod.OPT);
const pcs = P.cornerPieces(ctx, +X + A, +Y + A, +Z + A, ox, oz);
console.log(`vertex ${v0} offset (${ox.toFixed(2)},${oz.toFixed(2)}) mat ${m.mat[v0]}; ${pcs.length} pieces`);
for (const p of pcs) {
  console.log(` piece ${p.A}|${p.B} n=${p.n} conf=${p.conf} sup=${p.support(ox, oz).toFixed(2)} s=${p.evalS(ox, oz, mod.OPT.h, false).toFixed(3)}`);
  for (let i = 0; i < p.n; i++) {
    const cv = p.cv[i];
    console.log(`   pt (${(p.x[i] + +X).toFixed(2)},${(p.z[i] + +Z).toFixed(2)}) t=(${p.tx[i].toFixed(2)},${p.tz[i].toFixed(2)}) curve k=${cv.k.toFixed(3)} w=(${cv.wx.toFixed(2)},${cv.wz.toFixed(2)}) c=${cv.c.toFixed(2)} o=(${cv.ox.toFixed(2)},${cv.oz.toFixed(2)}) t=${cv.t?.toFixed(3)}`);
  }
}
const mc = ctx.mcAt(+Y + A);
let s = '';
for (let z = +Z - 5; z < +Z + 5; z++) { let r = ''; for (let x = +X - 5; x < +X + 5; x++) { const l = mc.at(x + A, z + A); r += (l < 0 ? '.' : 'xgdSsp'[l]) + (mc.hh[(z + A) * mc.nx + x + A] - A).toString().padStart(3) + ' '; } s += r + '\n'; }
console.log(s);
