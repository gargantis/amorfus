// Engine (lib/mbo.mjs, FREE unless a regime is given) on a 2D attack config:
// the X at lattice point xAt is moved to the origin and the config is run in
// the 8 square symmetries (jitter 0), with reversed block order, frozen jitter
// 1e-3 (seeds 1-3) and annealed noise (re-drawn jitter AMP for 100 steps, then a
// jitter-0 quench; seeds 1-5). Verdict = which diagonal pair at the X ended in
// one root phase (merge bookkeeping), with the merge step and the number of
// geometric pieces of that root at the end.
// node eng2d.mjs <cfg> <x,y> [n=32] [variants=all] [regime=FREE] [amp=0.1] [g=1] [s_b=0.2]
import { writeFileSync, mkdirSync } from 'node:fs';
import { xList, runEngine, outcome, phaseSummary } from './vu.mjs';
import { CFG2 } from './foamrun.mjs';
const [name, xat, nA, varA, regA, ampA, gA, sbA] = process.argv.slice(2);
const n = nA ? +nA : 32, amp = ampA ? +ampA : 0.1, g = gA ? +gA : 1, sb = sbA ? +sbA : 0.2;
const [X0, Y0] = xat.split(',').map(Number);
const REG = { FREE: { maxSteps: 300 }, FREE30: { maxSteps: 30, stopAfter: 99 }, 'FINITE-4': { maxSteps: 4, stopAfter: 99 }, 'CAGE-0.25': { anchor: { kind: 'cage', r: 0.25 }, maxSteps: 300 }, 'FID-0.05': { anchor: { kind: 'fidelity', k: 0.05 }, maxSteps: 300 } };
const regName = regA ?? 'FREE';
const T = {
  id: (u, v) => [u, v], rot90: (u, v) => [-v, u], rot180: (u, v) => [-u, -v], rot270: (u, v) => [v, -u],
  mirX: (u, v) => [-u, v], mirY: (u, v) => [u, -v], diag: (u, v) => [v, u], anti: (u, v) => [-v, -u],
};
const xform = (blocks, f) => blocks.map(([x, y, z, m]) => { const [u, v] = f(x + 0.5 - X0, y + 0.5 - Y0); return [Math.round(u - 0.5), Math.round(v - 0.5), 0, m]; });
const variants = [];
for (const t of Object.keys(T)) variants.push({ v: t, T: t });
variants.push({ v: 'rev', T: 'id', rev: true });
for (const s of [1, 2, 3]) variants.push({ v: `j1e-3s${s}`, T: 'id', jitter: 1e-3, seed: s });
for (const s of [1, 2, 3, 4, 5]) variants.push({ v: `ann${amp}s${s}`, T: 'id', anneal: { amp, steps: 100 }, seed: s });
for (const s of [1, 2, 3, 4, 5]) variants.push({ v: `annNM${amp}s${s}`, T: 'id', anneal: { amp, steps: 100, noMerge: true }, seed: s });
const want = varA && varA !== 'all' ? varA.split(',') : null;
const out = { cfg: name, X: [X0, Y0], n, regime: regName, g, s_b: sb, runs: [] };
mkdirSync(new URL('./eng/', import.meta.url), { recursive: true });
const tag = `${name}-${regName}-n${n}-g${g}-s${sb}${ampA ? '-amp' + amp : ''}`;
const base = CFG2[name]();
for (const V of variants) {
  if (want && !want.includes(V.v) && !(want.includes('sym') && T[V.v]) && !(want.includes('ann') && V.anneal && !V.anneal.noMerge) && !(want.includes('annNM') && V.anneal?.noMerge) && !(want.includes('frozen') && V.jitter)) continue;
  let blocks = xform(base, T[V.T]);
  if (V.rev) blocks = blocks.slice().reverse();
  const X = xList(blocks, { g });
  const xi = X.xs.filter((x) => x.at[0] === 0 && x.at[1] === 0);
  const opts = { dims: 2, n, s: sb * n, g, ...REG[regName], jitter: V.jitter ?? 0, seed: V.seed ?? 1 };
  if (V.anneal) opts.maxSteps = 250;
  const sim = runEngine(blocks, opts, V.anneal ? { anneal: V.anneal, quenchSteps: 250 } : {});
  const oc = outcome(sim, X.xs);
  const main = oc.filter((o) => o.at[0] === 0 && o.at[1] === 0)[0] ?? null;
  const rec = { v: V.v, steps: sim.steps, converged: !!sim.converged, ms: sim.ms, rule4: xi[0]?.rule4, size: xi[0]?.size,
    verdict: main?.verdict ?? 'no-X', geo: main?.geo ?? 'no-X', detail: main?.res, otherX: oc.filter((o) => o !== main).map((o) => `${o.at[0]},${o.at[1]}:${o.verdict}${o.res.some((r) => r.united && r.pieces > 1) ? '(split)' : ''}`).join(' '),
    phases: phaseSummary(sim).map((p) => `${p.mat}:${p.blocks}${p.pieces > 1 ? `[${p.pieces}pc]` : ''}`).join(' '), firstMerges: sim.mergeLog.slice(0, 6).map((m) => m.t) };
  out.runs.push(rec);
  console.log(`${V.v.padEnd(9)} verdict ${String(rec.verdict).padEnd(4)} geo ${String(rec.geo).padEnd(4)} rule4 ${rec.rule4} size ${rec.size} | steps ${rec.steps}${rec.converged ? '' : ' nc'} ${rec.ms}ms | ${JSON.stringify(rec.detail)} | others ${rec.otherX} | ${rec.phases}`);
  writeFileSync(new URL(`./eng/${tag}.json`, import.meta.url), JSON.stringify(out, null, 1));
}
const tally = {};
for (const r of out.runs) { const k = (r.v.startsWith('ann') ? r.v.replace(/s\d+$/, '') : r.v.startsWith('j') ? 'frozen' : 'sym/rev') + ':' + r.verdict + '/' + r.geo; tally[k] = (tally[k] ?? 0) + 1; }
out.tally = tally;
writeFileSync(new URL(`./eng/${tag}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log('TALLY', tag, JSON.stringify(tally));
