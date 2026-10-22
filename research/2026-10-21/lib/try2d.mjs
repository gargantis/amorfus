import { simulate, volumes } from './mbo.mjs';
import { renderSlice, savePng } from './render.mjs';
import { byName, to2D } from './configs.mjs';
for (const name of ['pair-diff', 'sq2-checker', 'sq2-ABCD', 'slab-line']) {
  const sim = simulate(to2D(byName(name).blocks), { dims: 2, maxSteps: 400 });
  savePng(`out/try2d/${name}-free.png`, renderSlice(sim, { axis: 2, at: 0.5, ppb: 60 }));
  const fsim = simulate(to2D(byName(name).blocks), { dims: 2, maxSteps: 200, anchor: { kind: 'fidelity', k: 0.15 } });
  savePng(`out/try2d/${name}-fid.png`, renderSlice(fsim, { axis: 2, at: 0.5, ppb: 60 }));
  console.log(name, sim.steps, volumes(sim).map((v) => `${v.mat}:${v.blocks}→${v.volume.toFixed(3)}`).join(' '), '| fid', fsim.steps, volumes(fsim).length, 'phases');
}
for (const name of ['sq2-checker', 'sq2-ABCD']) for (const [jit, seed] of [[0, 1], [1e-3, 1], [1e-3, 2], [1e-3, 3], [1e-2, 4]]) {
  const sim = simulate(to2D(byName(name).blocks), { dims: 2, maxSteps: 400, jitter: jit, seed });
  savePng(`out/try2d/${name}-j${jit}-s${seed}.png`, renderSlice(sim, { axis: 2, at: 0.5, ppb: 60 }));
  console.log(name, 'jitter', jit, 'seed', seed, 'steps', sim.steps, volumes(sim).map((v) => `${v.mat}:${v.blocks}→${v.volume.toFixed(2)}`).join(' '));
}
