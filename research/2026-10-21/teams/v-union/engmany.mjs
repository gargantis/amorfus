// Many-X configs in 2D: every same-material X's verdict across the 8 square
// symmetries, reversed block order and frozen jitter 1e-3 (seeds 1-3), compared
// with rule4 and the size rule. node engmany.mjs <cfg> [regime=FREE] [n=32]
import { writeFileSync, mkdirSync } from 'node:fs';
import { xList, runEngine, outcome } from './vu.mjs';
import { CFG2 } from './foamrun.mjs';
const [name, regA, nA] = process.argv.slice(2);
const n = nA ? +nA : 32;
const REG = { FREE: { maxSteps: 300 }, FREE30: { maxSteps: 30, stopAfter: 99 }, 'FINITE-4': { maxSteps: 4, stopAfter: 99 }, 'CAGE-0.25': { anchor: { kind: 'cage', r: 0.25 }, maxSteps: 300 }, 'FID-0.05': { anchor: { kind: 'fidelity', k: 0.05 }, maxSteps: 300 } };
const regName = regA ?? 'FREE';
const T = { id: (u, v) => [u, v], rot90: (u, v) => [-v, u], rot180: (u, v) => [-u, -v], rot270: (u, v) => [v, -u], mirX: (u, v) => [-u, v], mirY: (u, v) => [u, -v], diag: (u, v) => [v, u], anti: (u, v) => [-v, -u] };
const base = CFG2[name]();
const X0 = xList(base).xs;
const key = (x, y) => `${x},${y}`;
const tally = Object.fromEntries(X0.map((x) => [key(x.at[0], x.at[1]), { rule4: x.rule4, size: x.size, sizes: x.pairs.map((p) => `${p.mat}:${p.sizes.join('+')}`).join(' vs '), n: x.n, v: {} }]));
const variants = [...Object.keys(T).map((t) => ({ v: t, t })), { v: 'rev', t: 'id', rev: true }, ...[1, 2, 3].map((s) => ({ v: `j1e-3s${s}`, t: 'id', jitter: 1e-3, seed: s }))];
for (const V of variants) {
  const f = T[V.t];
  let blocks = base.map(([x, y, z, m]) => { const [u, v] = f(x + 0.5, y + 0.5); return [Math.round(u - 0.5), Math.round(v - 0.5), 0, m]; });
  if (V.rev) blocks.reverse();
  const X = xList(blocks);
  const sim = runEngine(blocks, { dims: 2, n, ...REG[regName], jitter: V.jitter ?? 0, seed: V.seed ?? 1 });
  const oc = outcome(sim, X.xs);
  for (const x0 of X0) {
    const [u, v] = f(x0.at[0], x0.at[1]);
    const o = oc.find((q) => q.at[0] === u && q.at[1] === v);
    const k = key(x0.at[0], x0.at[1]);
    const verdict = o ? `${o.first}${o.verdict !== o.first ? '(end ' + o.verdict + ')' : ''}` : 'missing';
    tally[k].v[verdict] = (tally[k].v[verdict] ?? 0) + 1;
  }
  console.log(V.v, sim.steps, 'steps', sim.ms, 'ms');
}
let agreeR = 0, agreeS = 0, decided = 0;
for (const [k, t] of Object.entries(tally)) {
  const top = Object.entries(t.v).sort((a, b) => b[1] - a[1])[0];
  t.majority = top[0]; t.unanimous = top[1] === variants.length;
  const maj = String(top[0]).split('(')[0];
  t.ruleAgree = String(t.rule4 === 0 ? 'none' : t.rule4) === maj; t.sizeAgree = String(t.size) === maj;
  if (t.unanimous) { decided++; if (t.ruleAgree) agreeR++; if (t.sizeAgree) agreeS++; }
  console.log(k.padEnd(7), `rule4 ${String(t.rule4).padEnd(2)} size ${String(t.size).padEnd(5)} | ${t.sizes} | win n ${t.n} | engine ${JSON.stringify(t.v)}`);
}
const out = { cfg: name, regime: regName, n, variants: variants.length, perX: tally, summary: { xs: X0.length, unanimous: decided, rule4AgreeOnUnanimous: agreeR, sizeAgreeOnUnanimous: agreeS } };
console.log('SUMMARY', name, regName, JSON.stringify(out.summary));
mkdirSync(new URL('./many/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./many/${name}-${regName}-n${n}.json`, import.meta.url), JSON.stringify(out, null, 1));
