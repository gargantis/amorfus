// v-table: metric sanity checks on synthetic fields with known answers.
import { makeField, cloudOf, indexCloud, topology, positions, scoreMesh } from './meshlib.mjs';
function fake(fn, lo, hi, n = 12) {
  const NX = (hi[0] - lo[0]) * n, NY = (hi[1] - lo[1]) * n, NZ = (hi[2] - lo[2]) * n;
  const D = new Float32Array(NX * NY * NZ);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) D[(k * NY + j) * NX + i] = fn(lo[0] + (i + 0.5) / n, lo[1] + (j + 0.5) / n, lo[2] + (k + 0.5) / n);
  return { NX, NY, NZ, n, ox: lo[0], oy: lo[1], oz: lo[2], D, label: new Uint8Array(D.length) };
}
const lo = [0, 0, 0], hi = [9, 8, 9], E0 = [2, 2, 2], E1 = [7, 6, 7];
const run = (name, fn, get, off = () => [0, 0, 0]) => {
  const c = fake(fn, lo, hi); const fd = makeField(c, 'D');
  const topo = topology(get, E0.map((v) => v - 2), E1.map((v) => v + 2));
  const o = new Map([...topo.corners].map(([k, { c: cc }]) => [k, off(cc)]));
  const cl = cloudOf(fd, E0.map((v) => v - 1), E1.map((v) => v + 1)), ix = indexCloud(cl, E0.map((v) => v - 1), E1.map((v) => v + 1)), clE = cloudOf(fd, E0, E1);
  console.log(name, JSON.stringify(scoreMesh(topo, positions(topo, o), cl, ix, fd, E0, E1, { sCloud: clE })));
};
const ground = (x, y, z) => (y < 4 ? 3 : 0);
run('flat, physics 0.3 above blocks (expect 0.3/0.3, bias -0.3)', (x, y) => 4.3 - y, ground);
run('flat, physics at blocks (expect ~0)', (x, y) => 4 - y, ground);
run('flat, physics 0.1 below, vertices moved -0.1 (expect ~0)', (x, y) => 3.9 - y, ground, () => [0, -0.1, 0]);
// tilted plane y = 4 + 0.25 (x - 4.5): blocks = staircase-free (ground), physics tilted
run('tilted plane slope 0.25 vs flat mesh (expect mean |0.25(x-4.5)|cos ~ 0.24*1.25=0.30?)', (x, y) => 4 + 0.25 * (x - 4.5) - y, ground);
