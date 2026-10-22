// Summarise Task 2 (res/t2/*.json) -> res/t2-summary.json; prints tables.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const dir = new URL('./res/t2/', import.meta.url);
const out = {};
const maxAbsDiff = (a, b, lo = 0, hi = a.length) => { let m = 0; for (let i = lo; i < hi; i++) { if (a[i] === null || b[i] === null) { if (a[i] !== b[i]) return Infinity; continue; } m = Math.max(m, Math.abs(a[i] - b[i])); } return +m.toFixed(5); };
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const r = JSON.parse(readFileSync(new URL(f, dir)));
  const key = f.replace('.json', '');
  const runs = r.runs;
  const res = { regime: r.regName, group: r.group, n: r.n, rows: {} };
  if (r.group === 'seam') {
    const ref = runs['seam-a5b5L4'];
    for (const [name, R] of Object.entries(runs)) {
      const g0 = R.m0.groove, gx = R.m0.grooveX;
      const iC = gx.findIndex((x) => Math.abs(x) < 1e-9);
      const near = (v) => gx.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(gx[bi] - v) ? i : bi), 0); const i5 = [near(-0.5), near(0.5)];
      const flat = Math.max(...g0.filter((v) => v !== null));
      res.rows[name] = {
        a: R.a, b: R.b, L: R.L, steps: R.info.steps, converged: R.info.converged,
        lam: Object.fromEntries(R.info.phases.map((p) => [p.mat === 6 ? 'A' : 'B', p.lamRun])), vol: R.info.phases.map((p) => `${p.mat}:${p.blocks}->${p.volume}`),
        grooveMin0: +Math.min(...g0.filter((v) => v !== null)).toFixed(4), grooveAtSeam0: g0[iC], flatMax0: flat,
        diffVsRef_D0_halfBlock: ref ? maxAbsDiff(g0, ref.m0.groove, i5[0], i5[1] + 1) : null,
        diffVsRef_D0_oneBlock: ref ? maxAbsDiff(g0, ref.m0.groove) : null,
        diffVsRef_full_halfBlock: ref ? maxAbsDiff(R.m.groove, ref.m.groove, i5[0], i5[1] + 1) : null,
        diffVsRef_labels_halfBlock: ref ? maxAbsDiff(R.m0.grooveLab, ref.m0.grooveLab, i5[0], i5[1] + 1) : null,
        seamX0: R.m0.seamY.map((s) => `${s.y}:${s.x.join('/')}`), seamXLab: R.m0.seamYLab.map((s) => `${s.y}:${s.x}`),
      };
    }
  } else if (r.group === 'edge') {
    const ref = runs['edge-k8L4'];
    for (const [name, R] of Object.entries(runs)) {
      const p0 = R.m0.prof, px = R.m0.profX;
      // horizontal inset of the top edge: distance from x = k back to where height = top - 0.25 / top - 0.05
      const top = R.top ?? 2;
      const insetAt = (drop) => { for (let i = px.length - 1; i >= 0; i--) if (p0[i] !== null && p0[i] >= top - drop) return +(R.k - px[i]).toFixed(3); return null; };
      res.rows[name] = { k: R.k, L: R.L, steps: R.info.steps, converged: R.info.converged, lam: R.info.phases.map((p) => p.lamRun), vol: R.info.phases.map((p) => `${p.blocks}->${p.volume}`),
        heightAtKminus1: p0[0], insetDrop005: insetAt(0.05), insetDrop025: insetAt(0.25), side0: R.m0.side.map((s) => `${s.y}:${s.x}`),
        diffVsRef_D0: ref && name !== 'edge-cube3' ? maxAbsDiff(p0, ref.m0.prof) : null,
        diffVsRef_D0_lastHalf: ref && name !== 'edge-cube3' ? maxAbsDiff(p0, ref.m0.prof, Math.floor(p0.length * 0.35)) : null,
        diffVsRef_labels: ref && name !== 'edge-cube3' ? maxAbsDiff(R.m0.profLab, ref.m0.profLab) : null };
    }
  } else if (r.group === 'incl') {
    const ref = runs['incl-slab7'];
    for (const [name, R] of Object.entries(runs)) {
      res.rows[name] = { k: R.k, steps: R.info.steps, converged: R.info.converged, lam: Object.fromEntries(R.info.phases.map((p) => [p.mat === 6 ? 'A' : 'B', p.lamRun])), vol: R.info.phases.map((p) => `${p.mat}:${p.blocks}->${p.volume}`),
        topCentre0: R.m0.topCentre, seams15_0: R.m0.seams15, seams19_0: R.m0.seams19, seamsDepth0: R.m0.seamsDepth,
        diffVsRef_D0: ref ? maxAbsDiff(R.m0.prof, ref.m0.prof) : null };
    }
  } else if (r.group === 'pit' || r.group === 'bump') {
    const ref = runs[`${r.group}-slab7`];
    for (const [name, R] of Object.entries(runs)) {
      res.rows[name] = { k: R.k, steps: R.info.steps, converged: R.info.converged, lam: R.info.phases.map((p) => p.lamRun), vol: R.info.phases.map((p) => `${p.blocks}->${p.volume}`),
        centre0: R.m0.centre, centreLab: R.m0.centreLab, diffVsRef_D0: ref ? maxAbsDiff(R.m0.prof, ref.m0.prof) : null, diffVsRef_labels: ref ? maxAbsDiff(R.m0.profLab, ref.m0.profLab) : null };
    }
  } else if (r.group === 'lam') {
    for (const [name, R] of Object.entries(runs)) {
      const d = R.dims; let SV = null, V = R.nBlocks, S = null, E = null;
      if (d) { const [a, b, c] = d; S = 2 * (a * b + b * c + a * c); SV = +(S / V).toFixed(4); E = 4 * (a + b + c); }
      res.rows[name] = { V, S, SV, convexEdgeLen: E, steps: R.info.steps, converged: R.info.converged, lam: R.info.phases[0]?.lamRun, lamRender: R.info.phases[0]?.lamRender, vol: R.info.phases[0]?.volume };
    }
  }
  out[key] = res;
  console.log(`\n== ${key}`);
  for (const [name, row] of Object.entries(res.rows)) console.log(name.padEnd(22), JSON.stringify(row));
}
writeFileSync(new URL('./res/t2-summary.json', import.meta.url), JSON.stringify(out, null, 1));
