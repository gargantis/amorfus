// v-table (T9): the class-11 seam shift (flat face whose 4 solid blocks are
// 3 of A and 1 odd B) measured on LABELS, at several n, in team table's E2c
// embedding (infinite octants, clamp blur), with and without volume.
//   node src/classseam.mjs <regime> <n> [--novol]
// Seam point = mean position of air sub-cells face-adjacent to both an A and
// a B cell (the A|B|air triple line), restricted to the diagonal x = z
// (|x - z| < 1.5/n) inside the cell; reported as (in-plane shift t = x = z,
// depth y). Canonical frame: solid layer is y > 0, odd block at +x +z.
// For comparison the render-field seam vertex (team table's measureCorner vseam).
import { appendFileSync } from 'node:fs';
import { simulateScene, measureCorner, REGIMES } from '../../table/src/sim.mjs';
import { embed, embOpts, MATS } from '../../table/src/classsim.mjs';

const [regime, nS] = process.argv.slice(2);
const n = +nS, novol = process.argv.includes('--novol');
const out = new URL('../res/classseam.jsonl', import.meta.url).pathname;
for (const key of ['00001112']) {
  const rep = key.split('').map(Number);
  const { opts: eo } = embOpts('E2c');
  const sim = simulateScene(embed(rep, 2), { ...REGIMES[regime], n, ...eo, ...(novol ? { volume: false } : {}) }, null);
  const { NX, NY, NZ, ox, oy, oz, label, phases } = sim;
  const matOf = (c) => (label[c] ? phases[label[c]].mat : 0);
  const A = MATS[1], B = MATS[2];
  const pts = [];
  for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const c = (k * NY + j) * NX + i;
    if (label[c]) continue;
    let a = false, b = false;
    for (const d of [1, -1, NX, -NX, NX * NY, -NX * NY]) { const m = matOf(c + d); if (m === A) a = true; if (m === B) b = true; }
    if (!a || !b) continue;
    const x = ox + (i + 0.5) / n, y = oy + (j + 0.5) / n, z = oz + (k + 0.5) / n;
    if (Math.abs(x) > 0.5 || Math.abs(z) > 0.5 || Math.abs(y) > 0.5) continue;
    pts.push([x, y, z]);
  }
  const diag = pts.filter((p) => Math.abs(p[0] - p[2]) < 1.5 / n);
  // label seam along the diagonal x = z = t: in each column (t, y, t) the first
  // solid cell from below (air side) and its material; the seam is where that
  // material switches from A to B; depth = that first solid cell's y
  const cellOf = (x, y, z) => { const i = Math.floor((x - ox) * n), j = Math.floor((y - oy) * n), k = Math.floor((z - oz) * n); return (k * NY + j) * NX + i; };
  let tSeam = null, ySeam = null, prevM = null;
  for (let t = -0.5; t <= 0.5 + 1e-9; t += 0.25 / n) {
    let m = 0, yy = null;
    for (let y = -0.75; y <= 0.75; y += 0.5 / n) { const mm = matOf(cellOf(t, y, t)); if (mm) { m = mm; yy = y; break; } }
    if (prevM === A && m === B && tSeam === null) { tSeam = t - 0.125 / n; ySeam = yy; }
    prevM = m;
  }
  const mean = (L, t) => (L.length ? L.reduce((s, p) => s + p[t], 0) / L.length : null);
  const m = measureCorner(sim, [0, 0, 0], rep.map((L) => MATS[L]));
  const rec = { regime, n, novol, key, steps: sim.steps, tripleCellsInCell: pts.length, diagCells: diag.length,
    labelShift: tSeam === null ? null : +tSeam.toFixed(4), labelDepth: ySeam === null ? null : +ySeam.toFixed(4),
    D_vseam: m.vseam, D_vsn: m.vsn };
  console.log(JSON.stringify(rec));
  appendFileSync(out, JSON.stringify(rec) + '\n');
}
