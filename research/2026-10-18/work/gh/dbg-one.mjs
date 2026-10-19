import * as core from '../../harness/core.mjs';
import { ALL_SCENES, BASE } from '../../harness/scenes.mjs';
import { siteMasks, planeNearestDir, planeNearestHalf } from './syn.mjs';
const scene = ALL_SCENES.find((s) => s.name === 'tower-r4.6');
const region = core.buildRegion(scene.cell, 10);
const total = region.blocks.length;
const solid = new Uint8Array(total);
for (let i = 0; i < total; i++) solid[i] = (region.blocks[i] & 0xff) !== 0 ? 1 : 0;
const { A, S } = siteMasks(solid, region);
const R = 8, A10 = 10;
const sc = [20 + A10, BASE + 3 + A10, 15 + A10];
const o = 0; // +x
const ra = [0, 0, 0];
planeNearestDir(A[o], region, 0, sc[0], sc[1], sc[2], R, ra);
console.log('near A', ra);
console.log('far A', planeNearestHalf(A[o], region, 0, sc[0], sc[1], sc[2], R, ra[1], ra[2]));
const s2 = [sc[0] - 1, sc[1], sc[2]];
console.log('2nd', planeNearestDir(A[o], region, 0, s2[0], s2[1], s2[2], R, [0, 0, 0]));
// print plan of the tower layer
for (let z = 9; z <= 22; z++) { let row = ''; for (let x = 9; x <= 22; x++) row += solid[core.regionIndex(region, x, BASE + 3, z)] ? '#' : '.'; console.log(z.toString().padStart(2), row); }
