// vmv: heuristic misreads. (1) Shallow straight edges 1:n (n = 8 … 24) and
// 1-wide lines, built exactly like harness edgeScene / thinLine (stone half
// plane / Bresenham line on hinted flat grass) but measured over the whole
// chunk [2, 30]; harness materialMetrics std / maxDev. (2) Player patterns:
// 2-wide checkers, checker borders, dotted / dashed lines — area ×, parts
// (block topology in brackets) and wrong area vs the painted blocks.
// Plan images: out/vmv-adv/misreads-*.png (hints | mv-quad).
import { join } from 'node:path';
import { rasterTopDown } from '../../harness/raster.mjs';
import { materialMetrics } from '../../harness/metrics.mjs';
import { planParts } from '../vmf/lib.mjs';
import { core, flatGround, loadApproach, plan, planRgb, matStats, fidelity, hcat, vcat, save, ROOT, frag } from './vlib.mjs';
const { GRASS, STONE } = core;
const DEG = Math.PI / 180;
const apps = [await loadApproach('approaches/hints.mjs'), await loadApproach('approaches/mv-quad.mjs')];
const P0 = [16.13, 16.37];
const edge = (n) => { const t = Math.atan(1 / n); const nn = [-Math.sin(t), Math.cos(t)]; return { plan: (x, z) => ((x + 0.5 - P0[0]) * nn[0] + (z + 0.5 - P0[1]) * nn[1] > 0 ? STONE : GRASS), ideal: { label: `1:${n}`, pair: [GRASS, STONE], kind: 'line', p0: P0, theta: t, window: [3, 3, 29, 29] } }; };
const thin = (n, c0) => {
  const s = 1 / n, xa = 1, xb = 31;
  const pick = (x) => Math.round(s * (x + 0.5) + c0 - 0.5);
  let off = 0, k = 0; for (let x = xa; x < xb; x++) { off += pick(x) + 0.5 - (s * (x + 0.5) + c0); k++; }
  const c = c0 + off / k, theta = Math.atan(s);
  return { plan: (x, z) => (x >= xa && x < xb && z === pick(x) ? STONE : GRASS), ideal: { label: `1-wide 1:${n}`, pair: [GRASS, STONE], kind: 'band', p0: [0, c], theta, hw: Math.cos(theta) / 2, window: [3, 3, 29, 29] } };
};
console.log('| shallow boundary (std / maxDev, worst boundary; parts) | hints | mv-quad |');
console.log('|---|---|---|');
const imgsShallow = [];
for (const [label, sc] of [['edge 1:8', edge(8)], ['edge 1:10', edge(10)], ['edge 1:12', edge(12)], ['edge 1:16', edge(16)], ['edge 1:24', edge(24)], ['line 1:8', thin(8, 13.3)], ['line 1:12', thin(12, 13.3)], ['line 1:16', thin(16, 14.3)]]) {
  const cells = [], row = [];
  for (const A of apps) {
    const m = A.mesh(core.buildRegion(flatGround(sc.plan), A.apron ?? 10), null, core);
    const img = rasterTopDown(m, { S: 32, fragment: frag(A) });
    const r = materialMetrics(img, { feature: STONE, window: [2, 2, 30, 30], ideals: [sc.ideal] });
    const b = r.boundaries.reduce((a, x) => (x.std > a.std ? x : a), r.boundaries[0]);
    cells.push(`${b.std.toFixed(3)} / ${b.maxDev.toFixed(3)}, ${r.components} part${r.components === 1 ? '' : 's'}`);
    const im = plan(A, flatGround(sc.plan), [0, 6, 32, 26], 16);
    row.push(planRgb(im.img));
  }
  console.log(`| ${label} | ${cells.join(' | ')} |`);
  imgsShallow.push(hcat(row, 6));
}
save(join(ROOT, 'out', 'vmv-adv', 'misreads-shallow.png'), vcat(imgsShallow, 6));

const box = (x, z, x0 = 8, z0 = 8, x1 = 24, z1 = 24) => x >= x0 && x < x1 && z >= z0 && z < z1;
const md = (a, m) => ((a % m) + m) % m;
const PAT = {
  'checker 2x2 cells': (x, z) => (box(x, z) && (Math.floor(x / 2) + Math.floor(z / 2)) % 2 === 0 ? STONE : GRASS),
  'checker 3x3 cells': (x, z) => (box(x, z, 7, 7, 25, 25) && (Math.floor((x - 7) / 3) + Math.floor((z - 7) / 3)) % 2 === 0 ? STONE : GRASS),
  'diag stripes 2 wide, gap 2': (x, z) => (box(x, z) && md(x - z, 4) < 2 ? STONE : GRASS),
  'horiz stripes 2 wide, gap 1': (x, z) => (box(x, z) && md(z - 8, 3) < 2 ? STONE : GRASS),
  'checker border 2 rows': (x, z) => ((z === 15 || z === 16) && x >= 5 && x < 27 && (x + z) % 2 === 0 ? STONE : GRASS),
  'checker border 3 rows': (x, z) => (z >= 15 && z <= 17 && x >= 5 && x < 27 && (x + z) % 2 === 0 ? STONE : GRASS),
  'dotted line (every 2nd)': (x, z) => (z === 16 && x >= 5 && x < 27 && x % 2 === 0 ? STONE : GRASS),
  'dotted diagonal (every 2nd)': (x, z) => (x === z && x >= 5 && x < 27 && x % 2 === 0 ? STONE : GRASS),
  'dashed line 2 on 1 off': (x, z) => (z === 16 && x >= 5 && x < 27 && md(x, 3) !== 2 ? STONE : GRASS),
  'diagonal with every 3rd missing': (x, z) => (x === z && x >= 5 && x < 27 && md(x, 3) !== 2 ? STONE : GRASS),
  'two parallel diagonals 1 apart': (x, z) => (x >= 5 && x < 27 && (z === x || z === x + 2) ? STONE : GRASS),
  'zigzag (1:1 arms of 3)': (x, z) => { if (x < 5 || x >= 27) return GRASS; const p = md(x - 5, 6); const zz = 14 + (p < 3 ? p : 6 - p); return z === zz ? STONE : GRASS; },
  'chevrons (V of 1:1 arms, 4)': (x, z) => (x >= 6 && x < 26 && z >= 10 && z < 22 && md(z - 10 - Math.abs(md(x - 6, 8) - 4), 6) === 0 ? STONE : GRASS),
  'diamond outline r4': (x, z) => (Math.abs(x - 16) + Math.abs(z - 16) === 4 ? STONE : GRASS),
  'diamond outline r6': (x, z) => (Math.abs(x - 16) + Math.abs(z - 16) === 6 ? STONE : GRASS),
  'single-cell diagonal X': (x, z) => (x >= 5 && x < 28 && z >= 5 && z < 28 && (x - z === 0 || x + z === 32) ? STONE : GRASS),
};
const WIN = [4, 4, 28, 28];
console.log('\n| pattern | painted blocks [block parts] | hints area ×, parts | mv-quad area ×, parts, wrong blocks² |');
console.log('|---|---|---|---|');
const rows = [];
for (const [label, pf] of Object.entries(PAT)) {
  let cellsN = 0; for (let z = WIN[1]; z < WIN[3]; z++) for (let x = WIN[0]; x < WIN[2]; x++) if (pf(x, z) === STONE) cellsN++;
  const bp = planParts(pf, WIN)[STONE];
  const out = [], row = [];
  for (const A of apps) {
    const { img } = plan(A, flatGround(pf), WIN, 20);
    const st = matStats(img, WIN);
    const f = fidelity(img, pf, WIN);
    out.push(`×${(st.area[STONE] / cellsN).toFixed(2)}, ${st.parts[STONE]}${st.specks[STONE] ? ` +${st.specks[STONE]} specks` : ''}${A.name === 'hints' ? '' : `, ${f.wrong.toFixed(1)}`}`);
    row.push(planRgb(img));
  }
  console.log(`| ${label} | ${cellsN} [${bp}] | ${out.join(' | ')} |`);
  rows.push(hcat(row, 4));
}
for (let i = 0; i < rows.length; i += 4) save(join(ROOT, 'out', 'vmv-adv', `misreads-patterns-${i / 4}.png`), hcat(rows.slice(i, i + 4), 16));
