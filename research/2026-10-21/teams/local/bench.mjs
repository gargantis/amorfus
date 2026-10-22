import { runSim, simInfo } from './lib/loc.mjs';
const A = 6;
const slab = []; for (let x = 0; x < 14; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 5; z++) slab.push([x, y, z, A]);
const which = process.argv[2];
if (which === '3d') {
  const sim = runSim(slab, 'FID-0.15', { n: 12, bbox: [0, 0, 0, 13, 2, 4] });
  console.log(JSON.stringify(simInfo(sim)), (process.memoryUsage().rss / 1e6).toFixed(0) + ' MB');
} else {
  const bar = []; for (let x = 0; x < 24; x++) for (let y = 0; y < 2; y++) bar.push([x, y, 0, A]);
  for (const r of ['FID-0.15', 'FINITE-4', 'CAGE-0.25']) {
    const sim = runSim(bar, r, { dims: 2, bbox: [0, 0, 0, 23, 2, 0] });
    console.log(JSON.stringify(simInfo(sim)), (process.memoryUsage().rss / 1e6).toFixed(0) + ' MB');
  }
}
