// Validation of the independent 2D solver (foam2d.mjs) against closed-form
// 2D results (single circle, equal and 1:2 double bubble), at two point
// spacings h. Writes cross2d/solvercheck.json.
import { writeFileSync } from 'node:fs';
import { fromBlocks } from './foam2d.mjs';
import { doubleBubble, circleR } from './exact.mjs';
const A = 6, B = 7;
const out = [];
for (const h of [0.04, 0.02]) {
  for (const [name, blocks, V] of [['single', [[0, 0, 0, A]], null], ['pair 1:1', [[0, 0, 0, A], [1, 0, 0, B]], [1, 1]], ['pair 1:2', [[0, 0, 0, A], [1, 0, 0, B], [2, 0, 0, B]], [1, 2]]]) {
    const F = fromBlocks(blocks, { h });
    const r = F.run({ maxTime: 120 });
    const s = F.summary();
    const rec = { name, h, steps: r.steps, converged: !!r.converged, energy: s.energy };
    if (!V) {
      const R = circleR(1);
      rec.exact = { r: R, energy: 2 * Math.PI * R, pressure: 1 / R };
      rec.meas = { r: s.films[0].r, rms: s.films[0].rms, pressure: s.bubbles[0].pressure };
    } else {
      const e = doubleBubble(V[0], V[1], 2);
      const outer = s.films.filter((f) => f.mats.includes(0)).sort((a, b) => a.r - b.r);
      const wall = s.films.find((f) => !f.mats.includes(0));
      const p = s.bubbles.slice().sort((a, b) => a.target - b.target).map((b) => b.pressure);
      rec.exact = { r1: e.r1, r2: e.r2, rWall: isFinite(e.r3) ? e.r3 : null, energy: e.energy.total, p1: 1 / e.r1, p2: 1 / e.r2 };
      rec.meas = { r1: outer[0].r, r2: outer[outer.length - 1].r, rWall: wall.r < 1e3 && V[0] !== V[1] ? wall.r : null, p1: p[0], p2: p[1],
        angles: s.junctions.map((j) => j.sectors.map((x) => +x.deg.toFixed(3))) };
    }
    rec.energyRelErr = rec.energy / rec.exact.energy - 1;
    out.push(rec);
    console.log(name, 'h', h, 'E', rec.energy.toFixed(5), 'exact', rec.exact.energy.toFixed(5), 'rel', rec.energyRelErr.toExponential(2), JSON.stringify(rec.meas));
  }
}
writeFileSync(new URL('./cross2d/solvercheck.json', import.meta.url).pathname, JSON.stringify(out, null, 1));
