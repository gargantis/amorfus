// Compact table of val3d/*.json. node summ3d.mjs [files...]
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('./val3d/', import.meta.url).pathname;
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => dir + f);
const pct = (m, e) => (e ? `${(100 * (m / e - 1)).toFixed(1)}%` : '-');
for (const f of files) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`== ${f.split('/').pop()}  n=${r.regime.n} s=${r.regime.s}`);
  for (const [name, c] of Object.entries(r.cases)) {
    const head = `${name.padEnd(11)} steps ${c.steps}${c.converged ? '' : '(nc)'}`;
    if (c.fitR !== undefined) {
      console.log(`${head} R fit ${c.fitR} exact ${c.exactR} (${pct(c.fitR, c.exactR)}) rms ${c.fitRms}; lambda run ${c.lambdaRun} pred ${c.lambdaPredLinear} (${pct(c.lambdaRun, c.lambdaPredLinear)})`);
    } else if (c.meas) {
      const m = c.meas, e = c.exact;
      const la = (c.localAngles || []).filter((x) => x.sectors).map((x) => Object.values(x.sectors).map((v) => v.toFixed(0)).join('/'));
      console.log(`${head} V ${c.V} r1 ${m.r1} (${pct(m.r1, e.r1)}) r2 ${m.r2} (${pct(m.r2, e.r2)}) a(proj) ${m.aProjected} (${pct(m.aProjected, e.a)}) a(fits) ${m.aFromOuterFits} (${pct(m.aFromOuterFits, e.a)})`);
      console.log(`${' '.repeat(11)} len ${m.length} (${pct(m.length, e.length)}) wall->tip1 ${m.wallToTip1} (${pct(m.wallToTip1, e.wallToTip1)}) wall->tip2 ${m.wallToTip2} (${pct(m.wallToTip2, e.wallToTip2)}) rWall fit ${m.rWallSphereFit} exact ${e.rWall} YL(meas r) ${m.youngLaplaceFromMeasuredR} rWall(lambda) ${c.lambda.wallRadiusFromLambda}`);
      console.log(`${' '.repeat(11)} sectors(fits) air ${m.sectorsFromFits.air} p1 ${m.sectorsFromFits.p1} p2 ${m.sectorsFromFits.p2}; local [air?] ${la.join('  ')}; lambda ${c.lambda.run} pred ${c.lambda.predOuter1},${c.lambda.predOuter2}`);
    } else if (c.tetra) {
      console.log(`${head} phases ${c.phases} contact ${c.contactAreas.map((x) => `${x.a}|${x.b}:${x.area}`).join(' ')}`);
      for (const J of c.planJunctions) console.log(`${' '.repeat(11)} plan J ${JSON.stringify(J.J)} sectors ${JSON.stringify(J.sectors)} miss ${J.miss}`);
      for (const t of c.tetra) console.log(`${' '.repeat(11)} tetra at ${t.at} extent ${t.extent} angles ${t.angles.map((a) => a.deg).join(' ')}`);
      console.log(`${' '.repeat(11)} census ${JSON.stringify(c.census.hist)}`);
    } else console.log(head, JSON.stringify(c).slice(0, 200));
  }
}
