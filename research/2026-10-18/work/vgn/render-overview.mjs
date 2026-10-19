// vgn: production (left) vs gn-best (right) overviews of real terrain chunks:
// overhang chunks, cliffs, ordinary surface. 3×2×3 chunk blocks so the
// chunk under study is surrounded; unedited → apron 3.
import { meshWorld, renderRow } from './world.mjs';
import { genBox } from './util.mjs';
const OUT = new URL('../../out/vgn-terrain/', import.meta.url).pathname;
const list = [
  ['ov-s7-4,1,2', [7, 7], [4, 1, 2]],
  ['ov-s7-3,1,1', [7, 7], [3, 1, 1]],
  ['ov-s1-2,1,4', [1, 1], [2, 1, 4]],
  ['cliff-s7-2,0,-1', [7, 7], [2, 0, -1]],
  ['cliff-s7-0,0,-3', [7, 7], [0, 0, -3]],
  ['surf-s1--3,1,0', [1, 1], [-3, 1, 0]],
  ['surf-s7-4,1,4', [7, 7], [4, 1, 4]],
];
const only = process.argv[2];
for (const [name, seed, c] of list) {
  if (only && !name.startsWith(only)) continue;
  // mean surface height of the chunk
  const { blocks } = genBox(seed, c[0] * 32, c[1] * 32 - 32, c[2] * 32, 32, 96, 32);
  let hs = 0, hn = 0;
  for (let z = 0; z < 32; z += 2) for (let x = 0; x < 32; x += 2) for (let y = 95; y >= 0; y--) if ((blocks[(y * 32 + z) * 32 + x] & 0xff) !== 0) { hs += y + c[1] * 32 - 32; hn++; break; }
  const h = hs / hn;
  const cy0 = Math.floor((h - 20) / 32), cy1 = Math.floor((h + 12) / 32);
  const w = meshWorld(seed, [c[0] - 1, cy0, c[2] - 1], [c[0] + 1, cy1, c[2] + 1]);
  const ctr = [c[0] * 32 + 16, h, c[2] * 32 + 16];
  for (const [k, off] of [['a', [26, 16, 26]], ['b', [-26, 14, -22]]]) {
    const eye = ctr.map((x, i) => x + off[i]);
    console.log(name + k, renderRow(`${OUT}${name}-${k}.png`, [w.prod, w.gn], { eye, target: ctr, fov: 60, width: 480, height: 340 }));
  }
}
