// Summarise Task 3 (res/t3/*.json) -> res/t3-summary.json
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('./res/t3/', import.meta.url);
const out = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const r = JSON.parse(readFileSync(new URL(f, dir)));
  const key = f.replace('.json', '');
  if (r.group === 'seamend') {
    out[key] = {};
    for (const [tag, R] of Object.entries(r.runs)) {
      const prof = (m) => m.groove.map((g) => {
        const hs = g.h.filter((v) => v !== null);
        const iS = R.zs.reduce((bi, z, i) => (Math.abs(z - R.wa) < Math.abs(R.zs[bi] - R.wa) ? i : bi), 0);
        const far = [g.h[0], g.h[g.h.length - 1]];
        return { x: g.x, atSeam: g.h[iS], min: hs.length ? +Math.min(...hs).toFixed(4) : null, sides: far, depthVsSides: g.h[iS] !== null && far[0] !== null && far[1] !== null ? +(0.5 * (far[0] + far[1]) - g.h[iS]).toFixed(4) : null };
      });
      const endNotch = (m) => m.endFace.map((e) => { const iS = R.zs.reduce((bi, z, i) => (Math.abs(z - R.wa) < Math.abs(R.zs[bi] - R.wa) ? i : bi), 0); return { y: e.y, atSeam: e.x[iS], sides: [e.x[0], e.x[e.x.length - 1]] }; });
      out[key][tag] = { info: { steps: R.info.steps, converged: R.info.converged, phases: R.info.phases.map((p) => `${p.mat}:${p.blocks}->${p.volume} lam ${p.lamRun}`) },
        grooveD0: prof(R.m0), grooveFull: prof(R.mF), endNotchD0: endNotch(R.m0), seamAtDepthD0: R.m0.seamAtDepth };
    }
  } else if (r.group === 'bridge') {
    out[key] = Object.fromEntries(Object.entries(r.runs).map(([k, R]) => [k, { phases: R.info.phases.map((p) => `${p.mat}:${p.blocks} lam ${p.lamRun}`), steps: R.info.steps,
      labelDiffs: R.labelDiff?.count, labelMaxDist: R.labelDiff?.maxDist, nearCells: R.labelDiff ? Object.entries(R.labelDiff.bins).filter(([d]) => +d < 1.5).reduce((a, [, v]) => a + v, 0) : null,
      farCells: R.labelDiff ? Object.entries(R.labelDiff.bins).filter(([d]) => +d >= 1.5).reduce((a, [, v]) => a + v, 0) : null,
      shift0ByBin: R.shiftBins0 ? Object.fromEntries(Object.entries(R.shiftBins0).sort((a, b) => a[0] - b[0]).map(([d, v]) => [d, v.max])) : null,
      dTop0: R.dTop0, farPts: R.farPts, seams: R.seams }]));
  } else if (r.group === 'superpos') {
    out[key] = r.runs;
  }
}
writeFileSync(new URL('./res/t3-summary.json', import.meta.url), JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) {
  console.log('\n==', k);
  if (k.startsWith('seamend')) for (const [tag, s] of Object.entries(v)) {
    console.log(' ', tag, s.info.phases.join(' | '));
    console.log('   groove D0 depth vs sides by x:', s.grooveD0.map((g) => `${g.x}:${g.depthVsSides}`).join(' '));
    console.log('   groove D0 height at seam by x:', s.grooveD0.map((g) => `${g.x}:${g.atSeam}`).join(' '));
    console.log('   end face notch (D0): ', JSON.stringify(s.endNotchD0));
  } else if (k.startsWith('bridge')) for (const [tag, s] of Object.entries(v)) console.log(' ', tag.padEnd(16), JSON.stringify({ ...s, farPts: undefined, shift0ByBin: undefined }), '\n    D0 shift by dist:', JSON.stringify(s.shift0ByBin));
  else for (const [tag, s] of Object.entries(v)) console.log(' ', tag, JSON.stringify(s).slice(0, 400));
}
