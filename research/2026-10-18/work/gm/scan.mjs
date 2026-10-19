// Scan surface chunks for exposed dirt/stone on the natural surface (sky-
// visible: the topmost solid in its column) and for steep slopes.
import { generateRegionGM, heightAt } from './gen-gm.mjs';
const res = [];
for (let cx = -12; cx <= 12; cx += 1) for (let cz = -12; cz <= 12; cz += 1) {
  // which cy holds the surface at the chunk centre
  const Hc = heightAt([1, 1], cx * 32 + 16, cz * 32 + 16);
  const cy = Math.floor(Hc / 32);
  const g = generateRegionGM([1, 1], cx * 32, cy * 32, cz * 32, 32, 32, 32);
  let top = [0, 0, 0, 0, 0], maxg = 0, steep = 0;
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    for (let y = 31; y >= 0; y--) {
      const v = g.blocks[(y * 32 + z) * 32 + x];
      if (v) { top[v]++; break; }
    }
    if (x < 31 && z < 31) {
      const gx = g.H[z * 32 + x + 1] - g.H[z * 32 + x], gz = g.H[(z + 1) * 32 + x] - g.H[z * 32 + x];
      const gg = Math.hypot(gx, gz);
      if (gg > maxg) maxg = gg;
      if (gg > 1) steep++;
    }
  }
  // exposed side faces of stone above H-12 (cliff stone)
  let sideStone = 0, sideDirt = 0;
  for (let y = 1; y < 31; y++) for (let z = 1; z < 31; z++) for (let x = 1; x < 31; x++) {
    const i = (y * 32 + z) * 32 + x, v = g.blocks[i];
    if (v !== 3 && v !== 2) continue;
    const H = g.H[z * 32 + x];
    if (cy * 32 + y < H - 8) continue;
    if (!g.blocks[i - 1] || !g.blocks[i + 1] || !g.blocks[i - 32] || !g.blocks[i + 32]) { if (v === 3) sideStone++; else sideDirt++; }
  }
  res.push({ c: [cx, cy, cz], top, maxg: +maxg.toFixed(2), steep, sideStone, sideDirt });
}
res.sort((a, b) => b.sideStone - a.sideStone);
console.log('most exposed stone near the surface:');
for (const r of res.slice(0, 8)) console.log(JSON.stringify(r));
res.sort((a, b) => b.steep - a.steep);
console.log('steepest:');
for (const r of res.slice(0, 8)) console.log(JSON.stringify(r));
res.sort((a, b) => b.top[4] - a.top[4]);
console.log('most sand:');
for (const r of res.slice(0, 6)) console.log(JSON.stringify(r));
