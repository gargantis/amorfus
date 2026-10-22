// Step 4: what a table lookup costs in a mesher-like loop.
//   node src/lookup-bench.mjs <regime>   (> logs/lookup-bench.log)
// The table is indexed directly by the rank of the corner's restricted-
// growth string (21147 entries: every 2x2x2 pattern of air and "same /
// different material"), each entry 3 int8 offsets in 1/256 block already in
// the occurrence frame, so no symmetry transform runs at mesh time.
// Compared with: reading the 8 blocks only, and the repo's 256-entry
// solid/air table (bevel-like). Run over the 16 bench chunks (seed [1,1]).
import { readFileSync } from 'node:fs';
import { allRG, buildClassTable, symPointInv } from './lattice.mjs';
import { generateRegion } from '../gen.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const reg = process.argv[2] ?? 'FID-0.15';
const tab = JSON.parse(readFileSync(`${ROOT}res/table/${reg}_${process.argv[3] ?? 'E2c_n12_clu-novol'}.json`, 'utf8')).entries;
const T = buildClassTable();

// rank of an RG string: cnt[i][m] = completions of positions i..7 with max label m
const cnt = Array.from({ length: 9 }, () => new Array(10).fill(0));
for (let m = 0; m <= 9; m++) cnt[8][m] = 1;
for (let i = 7; i >= 0; i--) for (let m = 0; m <= 8; m++) { let s = cnt[i + 1][m]; for (let v = 1; v <= m + 1 && v <= 8; v++) s += cnt[i + 1][Math.max(m, v)]; cnt[i][m] = s; }
const all = allRG(8);
const rankOf = (lab) => { let r = 0, m = 0; for (let i = 0; i < 8; i++) { const v = lab[i]; for (let u = 0; u < v; u++) r += cnt[i + 1][Math.max(m, u)]; if (v > m) m = v; } return r; };
// sanity: ranks are a bijection onto 0..21146 in enumeration order
let okRank = true;
all.forEach((lab, i) => { if (rankOf(lab) !== i) okRank = false; });
console.log(`RG strings ${all.length}, rank bijective in order: ${okRank}`);

const OFF = new Int8Array(all.length * 3);
let filled = 0;
all.forEach((lab, i) => {
  const e = T.lookup.get(lab.join(''));
  const t = tab[e.cls];
  if (!t || !t.vsn) return;
  const v = symPointInv(e.g, t.vseam && t.seamInCell ? t.vseam : t.vsn);
  for (let a = 0; a < 3; a++) OFF[i * 3 + a] = Math.max(-127, Math.min(127, Math.round(v[a] * 256)));
  filled++;
});
console.log(`table entries filled ${filled} of ${all.length} (${OFF.byteLength} bytes as int8 x3)`);
const BEV = new Int8Array(256 * 3); // stand-in solid/air table, same layout

const BENCH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2],
  [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const regions = BENCH.map((c) => { const r = generateRegion([1, 1], c[0] * 32 - 1, c[1] * 32 - 1, c[2] * 32 - 1, 33, 33, 33); return Uint8Array.from(r.blocks, (v) => v & 0xff); });
const D = [0, 1, 33 * 33, 33 * 33 + 1, 33, 34, 33 * 33 + 33, 33 * 33 + 34]; // b = ox | oz<<1 | oy<<2 -> offsets (x, z*33, y*33*33)
const OFFS = [0, 1, 33, 34, 33 * 33, 33 * 33 + 1, 33 * 33 + 33, 33 * 33 + 34];
const lab = new Int32Array(8), map = new Int32Array(256);
function pass(mode) {
  let acc = 0, surface = 0;
  for (const B of regions) {
    for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
      const base = (y * 33 + z) * 33 + x;
      let mask = 0, first = B[base], same = true;
      for (let b = 0; b < 8; b++) { const v = B[base + OFFS[b]]; lab[b] = v; if (v) mask |= 1 << b; if (v !== first) same = false; }
      if (mask === 0 || mask === 255) continue; // not a surface corner
      surface++;
      if (mode === 0) { acc += mask; continue; }
      if (mode === 1) { acc += BEV[mask * 3] + BEV[mask * 3 + 1] + BEV[mask * 3 + 2]; continue; }
      // RG relabel + rank
      for (let b = 0; b < 8; b++) map[lab[b]] = -1;
      let next = 0, r = 0, m = 0;
      for (let i = 0; i < 8; i++) {
        const v0 = lab[i];
        let v;
        if (v0 === 0) v = 0; else { if (map[v0] < 0) map[v0] = ++next; v = map[v0]; }
        for (let u = 0; u < v; u++) r += cnt[i + 1][u > m ? u : m];
        if (v > m) m = v;
      }
      acc += OFF[r * 3] + OFF[r * 3 + 1] + OFF[r * 3 + 2];
    }
  }
  return { acc, surface };
}
const MODES = [[0, 'read 8 blocks only'], [1, '256-entry solid/air table'], [2, 'RG rank + 21147-entry table']];
const best = [Infinity, Infinity, Infinity];
let sres;
for (let round = 0; round < 6; round++) for (const [mode] of MODES) {
  const t0 = performance.now();
  sres = pass(mode);
  best[mode] = Math.min(best[mode], performance.now() - t0);
}
for (const [mode, name] of MODES) {
  const ms = best[mode];
  console.log(`${name.padEnd(30)} best of 6 interleaved rounds: ${(ms / regions.length).toFixed(3)} ms per chunk (32^3 corners scanned, ${(sres.surface / regions.length).toFixed(0)} surface corners per chunk on average), ${(1e6 * ms / sres.surface).toFixed(1)} ns per surface corner including the scan`);
}
console.log(`incremental cost of the RG rank + lookup over reading the blocks: ${((best[2] - best[0]) / regions.length).toFixed(3)} ms per chunk`);
