// Summarise Task 1: influence radius per regime and perturbation kind.
// Reads res/t1/*.json, writes res/t1-summary.json and prints a table.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('./res/t1/', import.meta.url);
const TOL = { '1/256': 1 / 256, '1/64': 1 / 64, '1/16': 1 / 16 };
const out = {};
const distToInt = (x, a, b) => Math.max(a - x, 0, x - b);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const r = JSON.parse(readFileSync(new URL(f, dir)));
  if (f.startsWith('seam-')) continue;
  const key = `${r.regName}|${r.kind}`;
  const ds = Object.keys(r.runs).map(Number).sort((a, b) => a - b);
  const probe = ds.map((d) => ({ d, label: r.runs[d].probeDeltaLabel, D0: r.runs[d].probeDeltaD0, Dfull: r.runs[d].probeDeltaD,
    lam: r.runs[d].info.phases.map((p) => p.lamRun), labelDiffs: r.runs[d].labelDiff.count, labelMaxDist: r.runs[d].labelDiff.maxDist,
    steps: r.runs[d].info.steps, converged: r.runs[d].info.converged }));
  // centre-line envelope of |delta| against distance from the perturbed block's x-interval (all runs pooled)
  const env = { label: {}, D0: {}, Dfull: {} };
  for (const d of ds) {
    const R = r.runs[d]; const a = 2 + d, b = 3 + d;
    r.xs.forEach((x, i) => {
      const dist = distToInt(x, a, b);
      const k = (Math.floor(dist / 0.25) * 0.25).toFixed(2);
      const pairs = { label: [R.profC[i][1], r.base.profC[i][1]], D0: [R.profC0[i][0], r.base.profC0[i][0]], Dfull: [R.profC[i][0], r.base.profC[i][0]] };
      for (const [m, [p, q]] of Object.entries(pairs)) {
        if (p === null || q === null) continue;
        const v = Math.abs(p - q);
        env[m][k] = Math.max(env[m][k] ?? 0, v);
      }
    });
  }
  const dstar = (e) => Object.fromEntries(Object.entries(TOL).map(([name, t]) => {
    let m = null; for (const [k, v] of Object.entries(e)) if (v > t) m = Math.max(m ?? 0, +k + 0.25);
    return [name, m];
  }));
  // whole-surface field (D0): max |delta| per 0.5 bin, pooled over runs
  const field0 = {}, fieldF = {};
  for (const d of ds) {
    for (const [k, v] of Object.entries(r.runs[d].shiftBins0 ?? {})) field0[k] = Math.max(field0[k] ?? 0, v.max);
    for (const [k, v] of Object.entries(r.runs[d].shiftBins ?? {})) fieldF[k] = Math.max(fieldF[k] ?? 0, v.max);
  }
  const dstarField = (e) => Object.fromEntries(Object.entries(TOL).map(([name, t]) => {
    let m = null; for (const [k, v] of Object.entries(e)) if (v > t) m = Math.max(m ?? 0, +k + 0.5);
    return [name, m];
  }));
  out[key] = { regime: r.regName, kind: r.kind, base: { steps: r.base.steps, converged: r.base.converged, phases: r.base.phases },
    probe, envCentre: env, dstarCentre: { label: dstar(env.label), D0: dstar(env.D0), Dfull: dstar(env.Dfull) },
    field0, fieldFull: fieldF, dstarField: { D0: dstarField(field0), Dfull: dstarField(fieldF) },
    farUniformFull: probe.filter((p) => p.d >= 4).map((p) => p.Dfull) };
}
writeFileSync(new URL('./res/t1-summary.json', import.meta.url), JSON.stringify(out, null, 1));
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('regime|kind', 26), pad('base st/conv', 14), pad('d* centre D0 (1/256,1/64,1/16)', 34), pad('d* field D0', 22), pad('d* centre labels', 20), 'probe D0 by d | Dfull by d');
for (const [k, v] of Object.entries(out)) {
  const c = v.dstarCentre.D0, f = v.dstarField.D0, l = v.dstarCentre.label;
  console.log(pad(k, 26), pad(`${v.base.steps}/${v.base.converged}`, 14), pad(`${c['1/256']} ${c['1/64']} ${c['1/16']}`, 34), pad(`${f['1/256']} ${f['1/64']} ${f['1/16']}`, 22), pad(`${l['1/256']} ${l['1/64']} ${l['1/16']}`, 20),
    v.probe.map((p) => `${p.d}:${p.D0}`).join(' '), '|', v.probe.map((p) => `${p.d}:${p.Dfull}`).join(' '));
}
