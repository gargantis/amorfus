// Does 2D FID-0.15 on a 24x2 bar settle or cycle? Record history, volume and lambda per step.
import { setup, run, step, gaussKernel, DEFAULTS, volumes } from './lib/mbo-box.mjs';
import { REG } from './lib/loc.mjs';
const A = 6;
const out = {};
for (const [name, L, regName, extra] of [['bar24x2', 24, 'FID-0.15', {}], ['bar24x2', 24, 'FID-0.05', {}], ['bar24x2', 24, 'FID-0.15-novol', {}], ['bar24x2-n16', 24, 'FID-0.15', { n: 16 }], ['bar8x2', 8, 'FID-0.15', {}]]) {
  const bar = []; for (let x = 0; x < L; x++) for (let y = 0; y < 2; y++) bar.push([x, y, 0, A]);
  const o = { ...DEFAULTS, ...REG[regName], dims: 2, n: 32, ...extra, maxSteps: 60 };
  const sim = setup(bar, o);
  const ker = gaussKernel(o.s ?? 0.2 * o.n);
  const hist = [];
  for (let t = 1; t <= 60; t++) {
    const r = step(sim, o, ker);
    const v = volumes(sim)[0];
    hist.push([t, r.changes, +v.volume.toFixed(4), +sim.phases[1].lambda.toFixed(5)]);
  }
  const key = `${name} ${regName} ${JSON.stringify(extra)}`;
  out[key] = hist.slice(0, 6).concat(hist.slice(-6));
  console.log(key, JSON.stringify(out[key]));
}
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./res/osc2d.json', import.meta.url), JSON.stringify(out, null, 1));
