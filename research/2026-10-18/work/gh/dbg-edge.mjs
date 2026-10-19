// Print crossT and the sites behind it for y-edges (layer L → L+1) along x at given z.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { contourCross6 } from './syn2.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
const scene = ALL_SCENES.find((s) => s.name === process.argv[2]);
const L = Number(process.argv[3]), zs = process.argv[4].split(',').map(Number);
const r = core.buildRegion(scene.cell, 10);
const c = contourCross6(r, { ...cc8b.CFG, ...(process.argv[5] ? JSON.parse(process.argv[5]) : {}) });
const solid = (x, y, z) => { const i = core.regionIndex(r, x, y, z); return i >= 0 && (r.blocks[i] & 0xff) !== 0; };
for (const z of zs) {
  const row = [];
  for (let x = 6; x < 28; x++) {
    const i = core.regionIndex(r, x, L, z);
    const t = c.crossT[i * 3 + 1];
    row.push(t < 0 ? '  -  ' : (L + 0.5 + t).toFixed(2));
  }
  console.log(`z=${z} L=${L}:`, row.join(' '));
  // A-sites / air nearest in plane y=L for x=12 and 14
  for (const x of [10, 12, 14]) {
    let best = [99]; let bestAir = [99]; let bestS = [99];
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      const X = x + dx, Z = z + dz, d = Math.hypot(dx, dz);
      if (!solid(X, L, Z) && solid(X, L - 1, Z) && d < best[0]) best = [d, dx, dz];
      if (!solid(X, L, Z) && d < bestAir[0]) bestAir = [d, dx, dz];
      if (solid(X, L + 1, Z) && !solid(X, L + 2, Z) && d < bestS[0]) bestS = [d, dx, dz];
    }
    console.log(`   x=${x}: A-site ${best.map((v) => v.toFixed?.(2) ?? v).join(',')}  air ${bestAir.map((v) => v.toFixed?.(2) ?? v).join(',')}  S-site ${bestS.map((v) => v.toFixed?.(2) ?? v).join(',')}`);
  }
}
