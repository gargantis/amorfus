// Exact 2D solver (teams/phys/foam2d.mjs, unchanged) on attack configs: X decisions.
// node foamrun.mjs <cfgName> [maxTime] [h] [g] [holdTime]
import { writeFileSync, mkdirSync } from 'node:fs';
import { fromBlocks } from '../phys/foam2d.mjs';
import { swapAB } from './vu.mjs';
import * as K from './cfg-v.mjs';
export const CFG2 = {
  W1: () => K.to2(K.W1()), 'W1-swap': () => swapAB(K.to2(K.W1())), 'W1-bar2': () => K.to2(K.W1({ bar: 2 })), 'W1-blob4': () => K.to2(K.W1({ blob: 4 })),
  L2: () => K.to2(K.L2()), 'L2-swap': () => swapAB(K.to2(K.L2())), 'L2-shortA': () => K.to2(K.L2({ kA: [0, 1], tB: [-4, 5] })),
  'LX-6x6': () => K.to2(K.LX()), 'LX-8x2': () => K.to2(K.LX({ nA: 8, nB: 2 })), 'LX-10x4': () => K.to2(K.LX({ nA: 10, nB: 4 })),
  lineInDither: () => K.to2([...Array(64)].map((_, i) => { const x = i % 8, y = Math.floor(i / 8); return [x, y, x === y ? K.A : (x + y) % 2 ? K.B : K.C]; })),
  tripleLine: () => K.to2([...Array(64)].map((_, i) => { const x = i % 8, y = Math.floor(i / 8); return [x, y, x === y ? K.A : Math.abs(x - y) === 1 ? K.B : 0]; }).filter((b) => b[2])),
  lineToBlob: () => K.to2(K.lineToBlob()), slabLine: () => K.to2([...Array(36)].map((_, i) => [i % 6, Math.floor(i / 6), i % 6 === Math.floor(i / 6) ? K.A : K.B])), lineIntoChecker: () => K.to2(K.lineIntoChecker()),
  checkerSmallA: () => K.to2(K.checkerSmallA), diagEdge: () => K.to2(K.diagEdge), sq2checker: () => K.to2(K.sq2checker),
  diagEdgeDiff: () => K.to2(K.diagEdgeDiff), L3ABC: () => K.to2(K.L3ABC), ABACbig: () => K.to2(K.ABACbig()),
};
export function foam(blocks, { maxTime = 3, h = 0.04, g = 1, holdTime = 0.05, choose = null } = {}) {
  const F = fromBlocks(blocks, { g, h });
  const t0 = performance.now();
  const r = F.run({ maxTime, holdTime, choose });
  const ms = Math.round(performance.now() - t0);
  const ev = F.events.filter((e) => e.kind !== 'contact').map((e) => {
    if (e.kind === 'decide') return { t: +e.t.toFixed(4), kind: 'decide', at: e.at.map((v) => +v.toFixed(3)), options: e.options.map((o) => ({ mats: o.mats, rate: +o.rate.toFixed(5) })), decided: e.decided, pick: e.options[e.pick].mats };
    if (e.kind === 'merge') return { t: +e.t.toFixed(4), kind: 'merge', a: e.a, b: e.b, mat: e.mat };
    if (e.kind === 'split') return { t: +e.t.toFixed(4), kind: 'split', at: e.at.map((v) => +v.toFixed(3)), mats: e.mats, rate: +e.rate.toFixed(5) };
    return { t: +e.t.toFixed(4), kind: e.kind };
  });
  const s = F.summary();
  return { ms, res: { converged: !!r.converged, t: +r.t.toFixed(3), E: +r.E.toFixed(5), contact: r.contact ?? null }, events: ev,
    bubbles: s.bubbles.map((b) => ({ r: b.r, mat: b.mat, target: b.target, p: b.pressure === undefined ? null : +b.pressure.toFixed(4) })),
    adjacency: [...new Set(s.films.map((f) => f.mats.slice().sort((a, b) => a - b).join('|')))].sort(), F };
}
if (process.argv[1].endsWith('foamrun.mjs')) {
  const [name, mt, hh, gg, ht] = process.argv.slice(2);
  const out = foam(CFG2[name](), { maxTime: mt ? +mt : 3, h: hh ? +hh : 0.04, g: gg ? +gg : 1, holdTime: ht ? +ht : 0.05 });
  delete out.F;
  mkdirSync(new URL('./foam/', import.meta.url), { recursive: true });
  const tag = `${name}-T${mt ?? 3}-h${hh ?? 0.04}-g${gg ?? 1}-hold${ht ?? 0.05}`;
  writeFileSync(new URL(`./foam/${tag}.json`, import.meta.url), JSON.stringify(out, null, 1));
  console.log(tag, out.ms, 'ms', JSON.stringify(out.res));
  for (const e of out.events) if (e.kind !== 'merge') console.log('  ', JSON.stringify(e)); else console.log('   merge', e.t, e.mat);
}
