// GPU memory per chunk for the mx data path on the 16 bench chunks:
// codes, the prototyped r32uint 38³ volume, a 16-bit no-margin 32³ volume +
// code hash, an 8-bit variant, and a sparse 8³-brick layout (bricks holding
// a cell within 2 cells of a surface cell, the search's reach).
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { prep, computeCodes, DEFAULTS } from './prod.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let sum = { codes: 0, own: 0, bricks: 0, surf: 0 }, maxCodes = 0;
for (const c of CH) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const P = prep(inp);
  const { codes } = computeCodes(P, { ...DEFAULTS, loneRound: true });
  const n = codes.length / 6;
  let own = 0;
  for (let k = 0; k < codes.length; k += 6) if (codes[k] >= 0 && codes[k] < 32 && codes[k + 1] >= 0 && codes[k + 1] < 32 && codes[k + 2] >= 0 && codes[k + 2] < 32) own++;
  // bricks of the chunk's own 32³ (64 bricks of 8³) holding a cell within Chebyshev 2 of a surface cell
  const near = new Uint8Array(32 * 32 * 32);
  let surf = 0;
  for (let y = -2; y < 34; y++) for (let z = -2; z < 34; z++) for (let x = -2; x < 34; x++) {
    const i = P.off + x * P.stride[0] + y * P.stride[1] + z * P.stride[2];
    if (P.cm[i] === 0 || P.expo[i] === 0) continue;
    if (x >= 0 && x < 32 && y >= 0 && y < 32 && z >= 0 && z < 32) surf++;
    for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= 32 || Y >= 32 || Z >= 32) continue;
      near[(Y * 32 + Z) * 32 + X] = 1;
    }
  }
  const bk = new Set();
  for (let i = 0; i < near.length; i++) if (near[i]) { const x = i % 32, z = ((i / 32) | 0) % 32, y = (i / 1024) | 0; bk.add(((y >> 3) * 4 + (z >> 3)) * 4 + (x >> 3)); }
  sum.codes += n; sum.own += own; sum.bricks += bk.size; sum.surf += surf;
  maxCodes = Math.max(maxCodes, n);
}
const k = CH.length;
const codes = sum.codes / k, own = sum.own / k, bricks = sum.bricks / k;
console.log(`per chunk (mean of ${k}): codes ${codes.toFixed(0)} (max ${maxCodes}; own-block codes ${own.toFixed(0)}), surface cells ${(sum.surf / k).toFixed(0)}, 8³ bricks near the surface ${bricks.toFixed(1)} of 64`);
const KB = (b) => (b / 1024).toFixed(1) + ' KB';
const hash = (m) => 2 ** Math.ceil(Math.log2(Math.max(1, 2 * m))) * 12;
console.log(`A prototyped: r32uint 38³ ${KB(38 ** 3 * 4)} + codes ${KB(codes * 8)} (max ${KB(maxCodes * 8)})`);
console.log(`B 16-bit 32³ no margin (neighbour slots): ${KB(32 ** 3 * 2)} + hash ${KB(hash(own))} + slot table 108 B`);
console.log(`C 8-bit 32³ no margin: ${KB(32 ** 3)} + hash ${KB(hash(own))}`);
console.log(`D sparse 8³ bricks, 16-bit: ${KB(bricks * 512 * 2)} + brick table 128 B + hash ${KB(hash(own))}`);
for (const chunks of [200, 400]) console.log(`R = 192 with ${chunks} meshed chunks: A ${(chunks * (38 ** 3 * 4 + codes * 8) / 2 ** 20).toFixed(0)} MiB, B ${(chunks * (32 ** 3 * 2 + hash(own)) / 2 ** 20).toFixed(1)} MiB, C ${(chunks * (32 ** 3 + hash(own)) / 2 ** 20).toFixed(1)} MiB, D ${(chunks * (bricks * 1024 + 128 + hash(own)) / 2 ** 20).toFixed(1)} MiB`);
