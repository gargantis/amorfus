// v-table: are stone-only surface corners underground (cave) or exposed?
// A corner counts as 'underground' when its y < H(x,z) - 4 (the generator's cave condition), H from heightAt.
import { generateRegion, heightAt } from './repo.mjs';
const seed = process.argv[2].split(',').map(Number);
const rng = (s) => { const [a, b, c = 1] = s.split(':').map(Number); const o = []; for (let v = a; v <= b; v += c) o.push(v); return o; };
let stone = 0, stoneUnder = 0, other = 0, otherUnder = 0;
for (const cx of rng(process.argv[3])) for (const cz of rng(process.argv[4])) for (let cy = -2; cy <= 4; cy++) {
  const r = generateRegion(seed, cx * 32 - 1, cy * 32 - 1, cz * 32 - 1, 33, 33, 33); const B = r.blocks;
  for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    let a = false, m = 0;
    for (let b = 0; b < 8; b++) { const v = B[((y + ((b >> 2) & 1)) * 33 + (z + ((b >> 1) & 1))) * 33 + (x + (b & 1))] & 0xff; if (v) m |= 1 << v; else a = true; }
    if (!a || !m) continue;
    const wy = cy * 32 + y, H = heightAt(seed, cx * 32 + x, cz * 32 + z);
    const under = wy < H - 4;
    if (m === (1 << 3)) { stone++; if (under) stoneUnder++; } else { other++; if (under) otherUnder++; }
  }
}
console.log(`seed ${seed}: stone-only ${stone} (under H-4: ${(100 * stoneUnder / stone).toFixed(1)}%), other ${other} (under H-4: ${(100 * otherUnder / other).toFixed(1)}%)`);
