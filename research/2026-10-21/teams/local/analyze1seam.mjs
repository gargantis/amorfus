// Summarise the Task 1 seam probe (res/t1/seam-*.json) -> res/t1-seam-summary.json
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('./res/t1/', import.meta.url);
const TOL = { '1/256': 1 / 256, '1/64': 1 / 64, '1/16': 1 / 16 };
const out = {};
const distToInt = (x, a, b) => Math.max(a - x, 0, x - b);
for (const f of readdirSync(dir).filter((f) => f.startsWith('seam-')).sort()) {
  const r = JSON.parse(readFileSync(new URL(f, dir)));
  const ds = Object.keys(r.runs).map(Number).sort((a, b) => a - b);
  const env = { seam15_0: {}, seam05_0: {}, seam15: {}, seam15L: {}, top0: {} };
  for (const d of ds) {
    const R = r.runs[d]; const a = 2 + d, b = 3 + d;
    r.xs.forEach((x, i) => {
      const k = (Math.floor(distToInt(x, a, b) / 0.25) * 0.25).toFixed(2);
      for (const m of Object.keys(env)) {
        const p = R[m]?.[i], q = r.base[m]?.[i];
        if (p === null || q === null || p === undefined || q === undefined) continue;
        env[m][k] = Math.max(env[m][k] ?? 0, Math.abs(p - q));
      }
    });
  }
  const dstar = (e) => Object.fromEntries(Object.entries(TOL).map(([name, t]) => { let m = null; for (const [k, v] of Object.entries(e)) if (v > t) m = Math.max(m ?? 0, +k + 0.25); return [name, m]; }));
  out[r.regName] = {
    base: { steps: r.base.steps, converged: r.base.converged, phases: r.base.phases, seamAtX7: { y15: r.base.seam15[28], y05: r.base.seam05[28], y15_0: r.base.seam15_0?.[28], y05_0: r.base.seam05_0?.[28] } },
    probe: ds.map((d) => ({ d, seam15: r.runs[d].probeSeam15, seam05: r.runs[d].probeSeam05, seam15_0: r.runs[d].probeSeam15_0, seam05_0: r.runs[d].probeSeam05_0, top0: r.runs[d].probeTop0,
      labelDiffs: r.runs[d].labelDiff.count, labelMaxDist: r.runs[d].labelDiff.maxDist, lam: r.runs[d].info.phases.map((p) => `${p.mat}:${p.lamRun}`) })),
    env, dstar: Object.fromEntries(Object.entries(env).map(([m, e]) => [m, dstar(e)])),
  };
  const o = out[r.regName];
  console.log(r.regName.padEnd(16), 'base', `${o.base.steps}/${o.base.converged}`, 'seam@x7', JSON.stringify(o.base.seamAtX7), '\n   d* seam15_0', JSON.stringify(o.dstar.seam15_0), 'd* seam15 labels', JSON.stringify(o.dstar.seam15L), 'd* top0', JSON.stringify(o.dstar.top0),
    '\n   probe seam15_0 by d', o.probe.map((p) => `${p.d}:${p.seam15_0}`).join(' '), '| labelMaxDist', o.probe.map((p) => p.labelMaxDist).join(' '));
}
writeFileSync(new URL('./res/t1-seam-summary.json', import.meta.url), JSON.stringify(out, null, 1));
