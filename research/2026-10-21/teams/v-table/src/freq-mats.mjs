// v-table: surface corners by the set of materials present (1 grass 2 dirt 3 stone 4 sand)
//   node src/freq-mats.mjs <seedA,seedB> <cx0:cx1:step> <cz0:cz1:step>
import { generateRegion } from './repo.mjs';
const [seedS, cxS, czS] = process.argv.slice(2);
const seed = seedS.split(',').map(Number);
const rng = (s) => { const [a, b, c = 1] = s.split(':').map(Number); const o = []; for (let v = a; v <= b; v += c) o.push(v); return o; };
const by = new Map(); let surf = 0;
for (const cx of rng(cxS)) for (const cz of rng(czS)) for (let cy = -2; cy <= 4; cy++) {
  const r = generateRegion(seed, cx * 32 - 1, cy * 32 - 1, cz * 32 - 1, 33, 33, 33); const B = r.blocks;
  for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    let a = false, m = 0;
    for (let b = 0; b < 8; b++) { const v = B[((y + ((b >> 2) & 1)) * 33 + (z + ((b >> 1) & 1))) * 33 + (x + (b & 1))] & 0xff; if (v) m |= 1 << v; else a = true; }
    if (!a || !m) continue; surf++;
    const k = [1, 2, 3, 4].filter((t) => m & (1 << t)).map((t) => ['', 'grass', 'dirt', 'stone', 'sand'][t]).join('+');
    by.set(k, (by.get(k) ?? 0) + 1);
  }
}
console.log(`seed ${seed} surface ${surf}`);
for (const [k, n] of [...by.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${(100 * n / surf).toFixed(2)}%  ${k}`);
