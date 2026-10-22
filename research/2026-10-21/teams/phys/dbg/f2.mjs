import { fromBlocks } from '../foam2d.mjs';
import { byName, to2D } from '../../../lib/configs.mjs';
for (const name of process.argv.slice(2)) {
  const F = fromBlocks(to2D(byName(name).blocks), { h: 0.04 });
  const t0 = performance.now();
  const r = F.run({ maxTime: 80, log: false });
  const s = F.summary();
  console.log(name, 'steps', r.steps, 't', r.t.toFixed(2), 'conv', r.converged, 'contact', JSON.stringify(r.contact), 'ms', Math.round(performance.now() - t0), 'E', s.energy.toFixed(5));
  console.log('  events', JSON.stringify(F.events.map(e => ({t: +e.t.toFixed(3), kind: e.kind, mats: e.mats, rate: e.rate && +e.rate.toFixed(3), at: e.at && e.at.map(v=>+v.toFixed(2))}))));
  console.log('  bubbles', JSON.stringify(s.bubbles.map(b => ({mat: b.mat, area: +b.area.toFixed(4), p: +b.pressure.toFixed(4)}))));
  console.log('  junctions', JSON.stringify(s.junctions.map(j => ({at: j.at.map(v=>+v.toFixed(3)), sec: j.sectors.map(x => `${x.mat}:${x.deg.toFixed(1)}`)}))));
}
