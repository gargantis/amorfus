// vmx: copy of work/vmf/sensitivity.mjs (imports fixed, outputs redirected to out/vmx-adv and work/vmx, mx-codes added).
// vmf: single-block paint sensitivity ("flicker on edit") on flat hinted
// ground (material-only edits: rho unchanged, edited = false).
//  A) lone stone block at (16,16): paint ONE grass cell p (|dx|,|dz| ≤ 4) to
//     sand; measure the stone dot's displayed area (its own block) and parts.
//  B) 1-wide 1:1 stone line z = x: paint ONE grass cell within 3 of the line
//     (middle section) to sand; count stone parts (should stay 1) and the
//     min band width across the section.
//  C) influence radius: for each paint, the farthest displayed-material
//     change from the painted block (Chebyshev distance, blocks).
//   node work/vmf/sensitivity.mjs approaches/mf-iso.mjs [approaches/hints.mjs]
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import * as core from '../../harness/core.mjs';
import { flatGround } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, matStats, hcat, save, cropRgb, ROOT } from '../vmf/lib.mjs';
const { GRASS, STONE, SAND } = core;
const files = process.argv.slice(2).filter((a) => a.endsWith('.mjs'));
const S = 32;
const WIN = [6, 6, 26, 26];
function render(A, plan) {
  const region = core.buildRegion(flatGround(plan), A.apron ?? 10);
  const mesh = A.mesh(region, null, core);
  return planRaster(mesh, { x0: WIN[0], z0: WIN[1], w: WIN[2] - WIN[0], h: WIN[3] - WIN[1], S, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
}
function stoneIn(img, x0, z0, x1, z1) {
  let n = 0;
  for (let j = Math.round((z0 - img.z0) * S); j < Math.round((z1 - img.z0) * S); j++)
    for (let i = Math.round((x0 - img.x0) * S); i < Math.round((x1 - img.x0) * S); i++) if (img.mat[j * img.W + i] === STONE) n++;
  return n / (S * S);
}
function changeRadius(a, b, px, pz) {
  let r = 0;
  for (let j = 0; j < a.H; j++) for (let i = 0; i < a.W; i++) {
    const k = j * a.W + i;
    if (a.mat[k] === b.mat[k]) continue;
    const x = a.x0 + (i + 0.5) / S, z = a.z0 + (j + 0.5) / S;
    // distance from the painted block's square [px,px+1)×[pz,pz+1)
    const dx = Math.max(px - x, 0, x - (px + 1)), dz = Math.max(pz - z, 0, z - (pz + 1));
    r = Math.max(r, Math.max(dx, dz));
  }
  return r;
}
const out = {};
for (const f of files) {
  const A = await loadApproach(f);
  const res = { lone: [], line: [], radius: [] };
  // A) lone block
  const lone = (x, z) => (x === 16 && z === 16 ? STONE : GRASS);
  const base = render(A, lone);
  const a0 = stoneIn(base, 15, 15, 18, 18);
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    if (!dx && !dz) continue;
    const px = 16 + dx, pz = 16 + dz;
    const plan = (x, z) => (x === px && z === pz ? SAND : lone(x, z));
    const img = render(A, plan);
    const a = stoneIn(img, 15, 15, 18, 18);
    res.lone.push({ dx, dz, cheb: Math.max(Math.abs(dx), Math.abs(dz)), area: +a.toFixed(3), ratio: +(a / a0).toFixed(3), parts: matStats(img, [14, 14, 19, 19]).parts[STONE] });
    res.radius.push({ test: 'lone', dx, dz, r: +changeRadius(base, img, px, pz).toFixed(2) });
  }
  // B) diagonal line
  const line = (x, z) => (x >= 3 && x < 29 && z === x ? STONE : GRASS);
  const lbase = render(A, line);
  const widthMin = (img) => {
    let mn = Infinity;
    for (let t = 10; t <= 22; t += 0.05) { // across-line samples
      let c = 0;
      for (let s = -1.6; s <= 1.6; s += 1 / (4 * S)) {
        const x = t + 0.5 + s * Math.SQRT1_2, z = t + 0.5 - s * Math.SQRT1_2;
        const i = Math.floor((x - img.x0) * S), j = Math.floor((z - img.z0) * S);
        if (img.mat[j * img.W + i] === STONE) c++;
      }
      mn = Math.min(mn, c / (4 * S));
    }
    return mn;
  };
  const w0 = widthMin(lbase);
  for (let x = 13; x <= 18; x++) for (let d = -3; d <= 3; d++) {
    if (d === 0) continue;
    const px = x, pz = x + d;
    const plan = (xx, zz) => (xx === px && zz === pz ? SAND : line(xx, zz));
    const img = render(A, plan);
    const st = matStats(img, [9, 9, 23, 23]);
    res.line.push({ px, pz, d, parts: st.parts[STONE], widthMin: +widthMin(img).toFixed(3) });
    res.radius.push({ test: 'line', px, pz, r: +changeRadius(lbase, img, px, pz).toFixed(2) });
  }
  res.base = { loneArea: +a0.toFixed(3), lineWidthMin: +w0.toFixed(3) };
  out[A.name] = res;
  // summaries
  const byCheb = {};
  for (const e of res.lone) (byCheb[e.cheb] ??= []).push(e.ratio);
  console.log(`${A.name}: lone dot area ${a0.toFixed(3)} blocks²; ratio after one sand paint at Chebyshev distance d: ` +
    Object.entries(byCheb).map(([d, v]) => `d${d} [${Math.min(...v).toFixed(2)}, ${Math.max(...v).toFixed(2)}]`).join(' '));
  const lost = res.lone.filter((e) => e.parts !== 1);
  console.log(`  lone dot parts ≠ 1 after a paint: ${lost.length} of ${res.lone.length}${lost.length ? ' ' + JSON.stringify(lost.slice(0, 6)) : ''}`);
  const broke = res.line.filter((e) => e.parts !== 1);
  console.log(`  diagonal line (base min width ${w0.toFixed(3)}): ${broke.length} of ${res.line.length} single paints within 3 split it; min width over all paints ${Math.min(...res.line.map((e) => e.widthMin)).toFixed(3)}`);
  const byD = {};
  for (const e of res.line) (byD[Math.abs(e.d)] ??= []).push(e.widthMin);
  console.log('  line min width by paint distance |d| (cells off the line): ' + Object.entries(byD).map(([d, v]) => `${d}: [${Math.min(...v).toFixed(2)}, ${Math.max(...v).toFixed(2)}]`).join(' '));
  const rr = res.radius.map((e) => e.r);
  console.log(`  influence radius of a single paint (farthest changed pixel from the painted block): max ${Math.max(...rr).toFixed(2)}, median ${rr.sort((a, b) => a - b)[rr.length >> 1].toFixed(2)} blocks`);
}
writeFileSync(join(ROOT, 'work', 'vmx', 'sensitivity.json'), JSON.stringify(out, null, 1));
