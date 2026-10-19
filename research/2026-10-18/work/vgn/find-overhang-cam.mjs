// vgn: find generated overhangs (air with solid 1–3 blocks above it, whose
// side neighbour is open sky) and a camera 9 blocks out on the open side.
//   node work/vgn/find-overhang-cam.mjs <seed> <cx,cy,cz>
import { genBox } from './util.mjs';
const [sd, cs] = process.argv.slice(2);
const seed = sd.split(',').map(Number), c = cs.split(',').map(Number);
const N = 64, NY = 96;
const x0 = c[0] * 32 - 16, y0 = c[1] * 32 - 32, z0 = c[2] * 32 - 16;
const { blocks } = genBox(seed, x0, y0, z0, N, NY, N);
const solid = (x, y, z) => x < 0 || y < 0 || z < 0 || x >= N || y >= NY || z >= N ? false : (blocks[(y * N + z) * N + x] & 0xff) !== 0;
const sky = (x, y, z) => { for (let yy = y; yy < NY; yy++) if (solid(x, yy, z)) return false; return true; };
const out = [];
for (let y = 20; y < NY - 10; y++) for (let z = 16; z < 48; z++) for (let x = 16; x < 48; x++) {
  if (solid(x, y, z) || !solid(x, y - 1, z)) continue; // floor under an air block
  let roof = 0; for (let k = 1; k <= 3; k++) if (solid(x, y + k, z)) { roof = k; break; }
  if (!roof || roof < 2) continue; // need ≥ 1 air above the floor block
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let open = true; for (let t = 1; t <= 9; t++) if (!sky(x + dx * t, y + 1, z + dz * t)) { open = false; break; }
    if (open) out.push({ eye: [x0 + x + 0.5 + dx * 9, y0 + y + 2.5, z0 + z + 0.5 + dz * 9], target: [x0 + x + 0.5, y0 + y + 0.6, z0 + z + 0.5], roof });
  }
}
console.log(out.length, JSON.stringify(out.filter((_, i) => i % Math.max(1, Math.floor(out.length / 6)) === 0).slice(0, 6)));
