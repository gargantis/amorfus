// Pieces and slots at a scene corner: node work/mv/spieces.mjs <module> scene X Y Z mat [k=v]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
const [mp, sn, X, Y, Z, mat, ...rest] = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(mp)).href);
for (const a of rest) { const [k, v] = a.split('='); mod.OPT[k] = Number(v); }
const P = await import(pathToFileURL(resolve(mod.PIPE ?? 'work/mv/pipe5.mjs')).href);
const scene = ALL_SCENES.find((s) => s.name === sn);
const inp = core.buildRegion(scene.cell, mod.apron ?? 10);
const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
const A = inp.apron;
let v0 = -1;
for (let v = 0; v < m.V; v++) if (m.corner[v * 3] === +X && m.corner[v * 3 + 1] === +Y && m.corner[v * 3 + 2] === +Z && m.mat[v] === +mat) { v0 = v; break; }
const ox = m.pos[v0 * 3] - +X, oz = m.pos[v0 * 3 + 2] - +Z;
const ctx = P.buildContext(inp, mod.OPT);
const pcs = P.cornerPieces(ctx, +X + A, +Y + A, +Z + A, ox, oz);
console.log(`vertex ${v0} offset (${ox.toFixed(2)},${oz.toFixed(2)}) mat ${m.mat[v0]}; ${pcs.length} pieces`);
for (const p of pcs) console.log(` piece ${p.A}|${p.B} n=${p.n} conf=${p.conf} sup=${p.support(ox, oz).toFixed(2)} s=${p.evalS(ox, oz, mod.OPT.h, false).toFixed(3)} linels=${p.lx.map((x, i) => `[${x - A},${p.lz[i] - A}|${p.rx[i] - A},${p.rz[i] - A}]`).join('')}`);
const sl = P.vertexSlots(ctx, pcs, +mat, +X + A, +Y + A, +Z + A, ox, oz);
console.log('slots', sl && { s1: sl.s1, s2: sl.s2, o1: sl.o1, o2: sl.o2, op: sl.op });
