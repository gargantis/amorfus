// vgn: a small village on generated terrain (seed [1,1], chunk 3,0,-1, a
// gentle grassy area): hollow house (planks, door, windows, 1-thick roof),
// a fence line, lamp posts, a tree, a sharp brick chimney, a 1-wide stair
// to a platform. Production vs gn-best (flat palette) and the triplanar
// emulation. Production apron rule.
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { setBlock } from './util.mjs';
import { meshWorld, renderRow } from './world.mjs';
import { renderTri } from './triplanar-lib.mjs';
import { writePng } from '../../harness/png.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
const seed = [1, 1];
const PL = 5, ST = 3, BR = 6, GR = 1, SH = 256;
const cache = new Map();
function topAt(wx, wz) {
  for (let cy = 2; cy >= -1; cy--) {
    const k = `${Math.floor(wx / 32)},${cy},${Math.floor(wz / 32)}`;
    let inp = cache.get(k);
    if (!inp) { inp = buildGenMeshInput(seed, Math.floor(wx / 32), cy, Math.floor(wz / 32), new Map(), { forceApron: 0 }).input; cache.set(k, inp); }
    const lx = wx - Math.floor(wx / 32) * 32, lz = wz - Math.floor(wz / 32) * 32;
    for (let y = 31; y >= 0; y--) if ((inp.blocks[(y * 32 + lz) * 32 + lx] & 0xff) !== 0) return cy * 32 + y;
  }
}
const ox = 96, oz = -32; // chunk 3,0,-1 origin
const e = new Map();
// house 7×7, walls 4 high on a levelled floor at the max ground height
let floor = -1e9; for (let x = 4; x < 11; x++) for (let z = 4; z < 11; z++) floor = Math.max(floor, topAt(ox + x, oz + z));
for (let x = 4; x < 11; x++) for (let z = 4; z < 11; z++) {
  for (let y = topAt(ox + x, oz + z) + 1; y <= floor; y++) setBlock(e, ox + x, y, oz + z, PL); // foundation fill
  for (let h = 1; h <= 5; h++) {
    const wall = x === 4 || x === 10 || z === 4 || z === 10;
    const roof = h === 5;
    const door = z === 10 && x === 7 && h <= 2;
    const win = (x === 10 && (z === 6 || z === 8) && h === 3) || (z === 4 && x === 7 && h === 3);
    setBlock(e, ox + x, floor + h, oz + z, (wall || roof) && !door && !win ? PL : 0);
  }
}
// sharp brick chimney on the roof
for (let h = 6; h <= 8; h++) setBlock(e, ox + 9, floor + h, oz + 5, BR | SH);
// fence line, 1 wide, 2 high, along z = 14 from x = 2..20
for (let x = 2; x <= 20; x++) { const t = topAt(ox + x, oz + 14); for (let h = 1; h <= 2; h++) setBlock(e, ox + x, t + h, oz + 14, PL); }
// lamp posts 1×1×3
for (const [x, z] of [[14, 8], [18, 8], [14, 4], [18, 4]]) { const t = topAt(ox + x, oz + z); for (let h = 1; h <= 3; h++) setBlock(e, ox + x, t + h, oz + z, PL); }
// tree: trunk 1×1×5, leaf ball r 2.6
{ const tx = 22, tz = 20, t = topAt(ox + tx, oz + tz); for (let h = 1; h <= 5; h++) setBlock(e, ox + tx, t + h, oz + tz, PL);
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) if (Math.hypot(x, y, z) < 2.7 && !(x === 0 && z === 0 && y <= 0)) setBlock(e, ox + tx + x, t + 7 + y, oz + tz + z, GR); }
// 1-wide stair up to a 3×3 platform
{ const sx = 24, sz = 8, t0 = topAt(ox + sx, oz + sz); for (let i = 0; i < 5; i++) for (let h = 1; h <= i + 1; h++) setBlock(e, ox + sx + i, t0 + h, oz + sz, ST);
  for (let x = 29; x < 32; x++) for (let z = 7; z < 10; z++) for (let h = 1; h <= 5; h++) setBlock(e, ox + x, t0 + h, oz + z, ST); }
const W = meshWorld(seed, [2, 0, -2], [4, 0, 0], e);
console.log('aprons', W.aprons.map((r) => r[3]).join(','));
const cams = [
  ['a', { eye: [ox + 30, floor + 9, oz + 30], target: [ox + 12, floor + 1, oz + 9] }],
  ['b', { eye: [ox - 6, floor + 6, oz + 22], target: [ox + 14, floor + 1, oz + 8] }],
];
for (const [k, cam] of cams) {
  renderRow(`${OUT}village-${k}.png`, [W.prod, W.gn], { ...cam, fov: 60, width: 520, height: 360 });
  const a = renderTri(W.prod, { ...cam, width: 520, height: 360, fovDeg: 60 }), b = renderTri(W.gn, { ...cam, width: 520, height: 360, fovDeg: 60 });
  const gap = 4, WW = 2 * 520 + gap, rgb = new Uint8Array(WW * 360 * 3).fill(255);
  for (let j = 0; j < 360; j++) for (let i = 0; i < 520; i++) for (let q = 0; q < 3; q++) { rgb[(j * WW + i) * 3 + q] = a.rgb[(j * 520 + i) * 3 + q]; rgb[(j * WW + 524 + i) * 3 + q] = b.rgb[(j * 520 + i) * 3 + q]; }
  writePng(`${OUT}village-${k}-triplanar.png`, WW, 360, rgb);
  console.log(`${OUT}village-${k}.png and -triplanar.png`);
}
// close-up of the fence and a lamp post (triplanar emulation)
{
  const cam = { eye: [ox + 9, floor + 3.2, oz + 19.5], target: [ox + 14, floor + 1, oz + 14] };
  const a = renderTri(W.prod, { ...cam, width: 520, height: 360, fovDeg: 60 }), b = renderTri(W.gn, { ...cam, width: 520, height: 360, fovDeg: 60 });
  const gap = 4, WW = 2 * 520 + gap, rgb = new Uint8Array(WW * 360 * 3).fill(255);
  for (let j = 0; j < 360; j++) for (let i = 0; i < 520; i++) for (let q = 0; q < 3; q++) { rgb[(j * WW + i) * 3 + q] = a.rgb[(j * 520 + i) * 3 + q]; rgb[(j * WW + 524 + i) * 3 + q] = b.rgb[(j * 520 + i) * 3 + q]; }
  writePng(`${OUT}village-fence-closeup-triplanar.png`, WW, 360, rgb);
  console.log(`${OUT}village-fence-closeup-triplanar.png`);
}
