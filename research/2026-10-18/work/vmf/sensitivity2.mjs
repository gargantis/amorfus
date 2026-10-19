#!/usr/bin/env node
// vmf: same-material and third-material single paints next to 1-wide lines.
// Base patterns: a straight 1-wide stone line (z = 16) and the 1:1 diagonal.
// For every cell within 3 of the line's middle (x 12..19), paint it STONE
// (same material: a bump or a nearby dot) or SAND. A line should never get
// thinner because stone was ADDED next to it. Reports min width of the line
// along x ∈ [9, 22] (pinch < 0.15 = P) and stone parts.
//   node work/vmf/sensitivity2.mjs approaches/mf-iso.mjs [more…]
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import * as core from '../../harness/core.mjs';
import { flatGround } from './adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, matStats, hcat, vcat, save, ROOT } from './lib.mjs';
const { GRASS, STONE, SAND } = core;
const files = process.argv.slice(2).filter((a) => a.endsWith('.mjs'));
const S = 32;
const WIN = [6, 6, 26, 26];
const render = (A, plan) => {
  const region = core.buildRegion(flatGround(plan), A.apron ?? 10);
  const mesh = A.mesh(region, null, core);
  return planRaster(mesh, { x0: WIN[0], z0: WIN[1], w: 20, h: 20, S, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
};
const at = (img, x, z) => { const i = Math.floor((x - img.x0) * S), j = Math.floor((z - img.z0) * S); return img.mat[j * img.W + i]; };
const BASES = {
  hline: { plan: (x, z) => (x >= 4 && x < 28 && z === 16 ? STONE : GRASS), across: (t, s) => [t, 16.5 + s], cell: (t, d) => [t, 16 + d] },
  dline: { plan: (x, z) => (x >= 4 && x < 28 && z === x ? STONE : GRASS), across: (t, s) => [t + 0.5 + s * Math.SQRT1_2, t + 0.5 - s * Math.SQRT1_2], cell: (t, d) => [t, t + d] },
};
const out = {};
for (const f of files) {
  const A = await loadApproach(f);
  out[A.name] = {};
  for (const [bn, B] of Object.entries(BASES)) {
    // min width of the line along t ∈ [9,22], skipping ±1.5 around the paint
    const width = (img, skip) => {
      let mn = Infinity, where = null;
      for (let t = 9; t <= 22; t += 0.05) {
        if (skip !== null && Math.abs(t + 0.5 - skip) < 1.5) continue;
        let c = 0;
        for (let s = -1.6; s <= 1.6; s += 1 / (4 * S)) { const [x, z] = B.across(t, s); if (at(img, x, z) === STONE) c++; }
        const w = c / (4 * S);
        if (w < mn) { mn = w; where = t; }
      }
      return [mn, where];
    };
    const base = render(A, B.plan);
    const [bw] = width(base, null);
    const rows = [];
    const imgs = [];
    for (const paint of [STONE, SAND]) {
      for (let t = 12; t <= 19; t++) for (let d = -3; d <= 3; d++) {
        if (d === 0) continue;
        const [px, pz] = B.cell(t, d);
        const plan = (x, z) => (x === px && z === pz ? paint : B.plan(x, z));
        const img = render(A, plan);
        const [w, where] = width(img, bn === 'hline' ? px : px);
        const parts = matStats(img, [8, 8, 24, 24]).parts[STONE];
        rows.push({ paint: paint === STONE ? 'stone' : 'sand', px, pz, d, minWidthAway: +w.toFixed(3), at: where, parts });
        if (paint === STONE && t === 15 && (d === 1 || d === 2)) imgs.push(planRgb(img));
      }
    }
    const worst = (p, dd) => Math.min(...rows.filter((r) => r.paint === p && Math.abs(r.d) === dd).map((r) => r.minWidthAway));
    console.log(`${A.name} ${bn}: base min width ${bw.toFixed(3)}; after ONE paint, min width ≥1.5 from it — stone paint d1 ${worst('stone', 1).toFixed(3)} d2 ${worst('stone', 2).toFixed(3)} d3 ${worst('stone', 3).toFixed(3)}; sand paint d1 ${worst('sand', 1).toFixed(3)} d2 ${worst('sand', 2).toFixed(3)} d3 ${worst('sand', 3).toFixed(3)}`);
    const pinched = rows.filter((r) => r.minWidthAway < 0.15);
    console.log(`  paints that pinch the line (< 0.15) away from the paint: ${pinched.length} of ${rows.length}${pinched.length ? ' e.g. ' + JSON.stringify(pinched.slice(0, 4)) : ''}`);
    out[A.name][bn] = { base: bw, rows };
    if (imgs.length) save(join(ROOT, 'out', 'vmf-adv', `sens-${bn}-${A.name}.png`), hcat([planRgb(base), ...imgs]));
  }
}
writeFileSync(join(ROOT, 'work', 'vmf', 'sensitivity2.json'), JSON.stringify(out, null, 1));
