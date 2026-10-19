// vgn: production vs gn-best inside generated caves and at overhangs/cliffs.
// Left = production, right = gn-best. Unedited terrain → apron 3 (production rule).
import { meshWorld, renderRow } from './world.mjs';
const OUT = new URL('../../out/vgn-terrain/', import.meta.url).pathname;
const views = [
  { name: 'cave-s1-a', seed: [1, 1], c0: [-3, -2, -1], c1: [-1, -1, 1], eye: [-51.5, -32.5, 9.5], dir: [1, 0, 0] },
  { name: 'cave-s1-b', seed: [1, 1], c0: [-3, -2, -1], c1: [-1, -1, 1], eye: [-49.5, -32.5, 9.5], dir: [0, -0.3, 1] },
  { name: 'cave-s7-a', seed: [7, 7], c0: [1, -2, -3], c1: [2, -1, -2], eye: [57.5, -25.5, -63.5], dir: [1, -0.4, 1] },
  { name: 'cave-s7-b', seed: [7, 7], c0: [1, -2, -3], c1: [2, -1, -2], eye: [56.5, -25.5, -64.5], dir: [-1, -0.3, 0] },
];
const only = process.argv[2];
for (const v of views) {
  if (only && !v.name.startsWith(only)) continue;
  const w = meshWorld(v.seed, v.c0, v.c1);
  const l = Math.hypot(...v.dir);
  const target = v.eye.map((e, i) => e + v.dir[i] / l * 10);
  console.log(v.name, renderRow(`${OUT}${v.name}.png`, [w.prod, w.gn], { eye: v.eye, target, fov: 75, width: 480, height: 340 }));
}
