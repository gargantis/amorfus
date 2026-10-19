// Code-level seam test for mx-codes: adjacent chunks each compute codes from
// their own region (apron 10); every (block, direction) both chunks code must
// be bit-identical, a block coded by one and not the other (where both can be
// queried) is a mismatch, and fragments sampled on chunk A's mesh within 1.5
// blocks of the shared face must get the same material from A's GPU data and
// from B's GPU data.
//  node work/mx/seamcodes.mjs [--apron N]
import * as core from '../../harness/core.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { AIR, GRASS, DIRT, STONE, SAND, PLANKS } from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { prep, computeCodes, buildTexels, fragmentGpu, DEFAULTS, DIRS, UVA } from './prod.mjs';
const args = process.argv.slice(2);
const ai = args.indexOf('--apron');
const APRON = ai >= 0 ? Number(args[ai + 1]) : 10;
const OPTS = { ...DEFAULTS, loneRound: true };
const YB = 0.5;
// the harness seams.mjs world (copied): painted hinted hill + built shapes across x = 32 and z = 32
const h = (x, z) => 9 + 4 * Math.exp(-((x - 30) ** 2 + (z - 34) ** 2) / (2 * 7 ** 2)) + 0.6 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
const plan = (x, z) => {
  if (Math.hypot(x + 0.5 - 31.2, z + 0.5 - 30.4) < 4.3) return STONE;
  if (z + 0.5 > 0.5 * (x + 0.5) + 30.7) return SAND;
  if (x - z === 6 && x > 20 && x < 44) return STONE;
  return GRASS;
};
const world = (x, y, z) => {
  if (Math.hypot(x + 0.5 - 33, y + 0.5 - 12, z + 0.5 - 12) < 5.2 && y >= 12) return { v: PLANKS, edited: true };
  if (z >= 40 && z < 48 && x >= 24 && x < 40 && y >= 12 && y + 0.5 < 12 + (x + 0.5 - 24) / 4) return { v: STONE, edited: true };
  if (Math.hypot(x + 0.5 - 40, y + 0.5 - 13, z + 0.5 - 31) < 4 && y < 13) return { v: AIR, edited: true };
  const d = h(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  return { v: depth <= 1 ? plan(x, z) : depth <= 4 ? DIRT : STONE, rho: clampRho(d) };
};
const synth = (cx, cy, cz) => core.buildRegion((x, y, z) => world(x + cx * 32, y + cy * 32, z + cz * 32), APRON);
const terr = (cx, cy, cz) => buildGenMeshInput([1, 1], cx, cy, cz, new Map(), { forceApron: APRON }).input;
function run(region) {
  const P = prep(region);
  const { codes } = computeCodes(P, OPTS);
  const G = buildTexels(P, codes, 3);
  const m = new Map();
  for (let c = 0; c < codes.length; c += 6) m.set(`${codes[c]},${codes[c + 1]},${codes[c + 2]},${codes[c + 3]}`, [codes[c + 4], codes[c + 5]]);
  return { P, codes: m, G, mesh: core.decodeMesh(core.meshRegion({ ...region, params: {} })) };
}
// can a block (local coords) be coded by a chunk (box per direction)?
const inBox = (d, x, y, z) => {
  const [a] = DIRS[d], [ua, va] = UVA[a];
  const p = [x, y, z];
  return p[ua] >= -1 && p[ua] <= 32 && p[va] >= -1 && p[va] <= 32 && p[a] >= -3 && p[a] <= 34;
};
let totalBad = 0;
function pair(label, mk, A, B) {
  const ra = run(mk(...A)), rb = run(mk(...B));
  const off = [B[0] - A[0], B[1] - A[1], B[2] - A[2]].map((v) => v * 32); // A-local = B-local + off
  let both = 0, diff = 0, onlyOne = 0;
  const seen = new Set();
  for (const [k, w] of ra.codes) {
    const [x, y, z, d] = k.split(',').map(Number);
    const bx = x - off[0], by = y - off[1], bz = z - off[2];
    if (!inBox(d, bx, by, bz)) continue;
    const wb = rb.codes.get(`${bx},${by},${bz},${d}`);
    seen.add(`${bx},${by},${bz},${d}`);
    if (!wb) { onlyOne++; continue; }
    both++;
    if (w[0] !== wb[0] || w[1] !== wb[1]) diff++;
  }
  for (const [k] of rb.codes) {
    if (seen.has(k)) continue;
    const [x, y, z, d] = k.split(',').map(Number);
    if (inBox(d, x + off[0], y + off[1], z + off[2])) onlyOne++;
  }
  // fragment samples on A's triangles near the shared face
  const axis = off.findIndex((v) => v !== 0);
  const face = off[axis] > 0 ? 32 : 0;
  const { pos, nrm, tri, T } = ra.mesh;
  let n = 0, fd = 0;
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    if (Math.abs((pos[a * 3 + axis] + pos[b * 3 + axis] + pos[c * 3 + axis]) / 3 - face) > 1.5) continue;
    for (let i = 1; i < 10; i++) for (let j = 1; j < 10 - i; j++) {
      const w0 = i / 10, w1 = j / 10, w2 = 1 - w0 - w1;
      const p = [0, 0, 0], nn = [0, 0, 0];
      for (let k = 0; k < 3; k++) { p[k] = w0 * pos[a * 3 + k] + w1 * pos[b * 3 + k] + w2 * pos[c * 3 + k]; nn[k] = w0 * nrm[a * 3 + k] + w1 * nrm[b * 3 + k] + w2 * nrm[c * 3 + k]; }
      if (Math.abs(p[axis] - face) > 1.0) continue;
      const mA = fragmentGpu(ra.G, nn, p[0], p[1], p[2], 2, null, YB);
      const mB = fragmentGpu(rb.G, nn, p[0] - off[0], p[1] - off[1], p[2] - off[2], 2, null, YB);
      n++;
      if (mA !== mB) fd++;
    }
  }
  console.log(`${label}: codes coded by both ${both}, differing ${diff}, coded by only one ${onlyOne}; fragments ${n}, differing ${fd} (apron ${APRON})`);
  totalBad += diff + onlyOne + fd;
}
pair('synthetic x-border', synth, [0, 0, 0], [1, 0, 0]);
pair('synthetic z-border', synth, [0, 0, 0], [0, 0, 1]);
pair('synthetic x-border z=1', synth, [0, 0, 1], [1, 0, 1]);
pair('terrain x (-2,1,1)|(-1,1,1)', terr, [-2, 1, 1], [-1, 1, 1]);
pair('terrain z (-1,1,1)|(-1,1,2)', terr, [-1, 1, 1], [-1, 1, 2]);
pair('terrain y (-1,0,1)|(-1,1,1)', terr, [-1, 0, 1], [-1, 1, 1]);
pair('terrain x (-3,1,0)|(-2,1,0)', terr, [-3, 1, 0], [-2, 1, 0]);
pair('terrain z (-3,1,0)|(-3,1,1)', terr, [-3, 1, 0], [-3, 1, 1]);
pair('terrain y (0,0,-3)|(0,1,-3)', terr, [0, 0, -3], [0, 1, -3]);
pair('terrain x (0,0,0)|(1,0,0)', terr, [0, 0, 0], [1, 0, 0]);
pair('terrain y (1,0,1)|(1,1,1)', terr, [1, 0, 1], [1, 1, 1]);
console.log(totalBad === 0 ? 'SEAMS OK' : `SEAM MISMATCHES: ${totalBad}`);
process.exitCode = totalBad ? 1 : 0;
