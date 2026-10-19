// Supplementary metric: high-pass jaggedness of material boundaries.
// Boundary points (as the harness extracts them) are ordered by arc position
// along the ideal curve; the deviation from the ideal curve minus its own
// moving average over ±W blocks of arc length is the high-frequency part
// (block-scale jaggies). std of the low-pass part = lumpiness.
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { boundaryPoints, idealDistance } from '../../harness/metrics.mjs';
import * as core from '../../harness/core.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const W = 1.0;
function arcPos(ideal, p) {
  if (ideal.kind === 'disc') { const a = Math.atan2(p[1] - ideal.c[1], p[0] - ideal.c[0]); return a * ideal.r; }
  if (ideal.kind === 'line' || ideal.kind === 'band') return (p[0] - ideal.p0[0]) * Math.cos(ideal.theta) + (p[1] - ideal.p0[1]) * Math.sin(ideal.theta);
  return null;
}
function inWin(ideal, p) {
  if (ideal.window) { const [a, b, c, d] = ideal.window; if (p[0] < a || p[0] > c || p[1] < b || p[1] > d) return false; }
  if (ideal.ray) { const { c, dir, min } = ideal.ray; if ((p[0] - c[0]) * Math.cos(dir) + (p[1] - c[1]) * Math.sin(dir) < min) return false; }
  return true;
}
export function highpass(img, scene) {
  const out = [];
  for (const ideal of scene.ideals ?? []) {
    if (ideal.kind === 'rect') continue;
    let pts = boundaryPoints(img, ideal.pair[0], ideal.pair[1]).filter((p) => inWin(ideal, p));
    if (ideal.kind === 'band') {
      // split the band into its two sides
      const sides = [[], []];
      for (const p of pts) { const d = (p[0] - ideal.p0[0]) * -Math.sin(ideal.theta) + (p[1] - ideal.p0[1]) * Math.cos(ideal.theta); sides[d > 0 ? 0 : 1].push(p); }
      for (const s of sides) out.push(one(ideal, s));
    } else out.push(one(ideal, pts));
  }
  return out;
}
function one(ideal, pts) {
  const rec = pts.map((p) => ({ s: arcPos(ideal, p), d: idealDistance(ideal, p) })).sort((a, b) => a.s - b.s);
  const n = rec.length;
  if (n < 5) return { hp: NaN, lp: NaN };
  let j0 = 0, j1 = 0, sum = 0;
  const hp = [], lp = [];
  for (let i = 0; i < n; i++) {
    while (j1 < n && rec[j1].s <= rec[i].s + W) sum += rec[j1++].d;
    while (rec[j0].s < rec[i].s - W) sum -= rec[j0++].d;
    const avg = sum / (j1 - j0);
    hp.push(rec[i].d - avg);
    lp.push(avg);
  }
  const sd = (v) => { const m = v.reduce((x, y) => x + y, 0) / v.length; return Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length); };
  return { hp: sd(hp), lp: sd(lp) };
}
// CLI: node work/mf/highpass.mjs approaches/a.mjs approaches/b.mjs …
if (process.argv[1].endsWith('highpass.mjs')) {
  const mods = [];
  for (const f of process.argv.slice(2)) mods.push(await import(pathToFileURL(resolve(f)).href));
  console.log(`| scene (high-pass std / low-pass std, blocks) | ${mods.map((m) => m.name).join(' | ')} |`);
  console.log(`|---|${mods.map(() => '---').join('|')}|`);
  for (const scene of MATERIAL_SCENES) {
    if (!scene.ideals?.length || scene.ideals.every((i) => i.kind === 'rect')) continue;
    const cells = [];
    for (const A of mods) {
      const region = core.buildRegion(scene.cell, A.apron ?? 10);
      const mesh = A.mesh(region, scene, core);
      const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S: 32, fragment: A.fragment ? (a, i) => A.fragment(a, i, scene) : null, scene });
      const r = highpass(img, scene);
      const worst = r.reduce((a, b) => (b.hp > (a?.hp ?? -1) ? b : a), null);
      const worstL = r.reduce((a, b) => (b.lp > (a?.lp ?? -1) ? b : a), null);
      cells.push(`${worst.hp.toFixed(3)} / ${worstL.lp.toFixed(3)}`);
    }
    console.log(`| ${scene.name} | ${cells.join(' | ')} |`);
  }
}
