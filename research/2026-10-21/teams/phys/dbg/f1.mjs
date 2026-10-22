import { fromBlocks } from '../foam2d.mjs';
import { doubleBubble, circleR } from '../exact.mjs';
const A = 6, B = 7;
for (const [name, blocks, V] of [['single', [[0,0,0,A]], null], ['pair', [[0,0,0,A],[1,0,0,B]], [1,1]], ['ABB', [[0,0,0,A],[1,0,0,B],[2,0,0,B]], [1,2]]]) {
  const F = fromBlocks(blocks, { h: 0.04 });
  const t0 = performance.now();
  const r = F.run({ maxTime: 60, log: false });
  const s = F.summary();
  console.log(name, 'steps', r.steps, 't', r.t.toFixed(2), 'conv', r.converged, 'ms', Math.round(performance.now() - t0), 'E', s.energy.toFixed(5));
  console.log('  bubbles', JSON.stringify(s.bubbles.map(b => ({mat: b.mat, area: +b.area.toFixed(5), p: +b.pressure.toFixed(4)}))));
  console.log('  films', JSON.stringify(s.films.map(f => ({mats: f.mats, r: +f.r.toFixed(4), rms: +f.rms.toExponential(1), len: +f.length.toFixed(4)}))));
  console.log('  junctions', JSON.stringify(s.junctions.map(j => ({at: j.at.map(v=>+v.toFixed(4)), sec: j.sectors.map(x => `${x.mat}:${x.deg.toFixed(2)}`)}))));
  if (V) { const e = doubleBubble(V[0], V[1], 2); console.log('  exact', 'r1', e.r1.toFixed(4), 'r2', e.r2.toFixed(4), 'r3', e.r3.toFixed(4), 'a', e.a.toFixed(4), 'E', e.energy.total.toFixed(5), 'p1', (1/e.r1).toFixed(4), 'p2', (1/e.r2).toFixed(4)); }
  else console.log('  exact r', circleR(1).toFixed(4), 'E', (2*Math.PI*circleR(1)).toFixed(5), 'p', (1/circleR(1)).toFixed(4));
}
