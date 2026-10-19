// vmv: edit stability. A player draws a stone path on hinted flat grass ONE
// block per step. After every step the plan view (S px/block) is compared
// with the previous step:
//   reach   = farthest changed pixel from the block just painted (Chebyshev, blocks)
//   far     = changed area (blocks²) more than 2 blocks from the new block
//   flicker = pixels whose material changes ≥ 2 times over the sequence
//             (hints: a pixel changes at most once, when its block is painted)
//   wrongEnd = final area shown with a material other than its block's
// A filmstrip of the steps goes to out/vmv-adv/edit-<path>-<approach>.png.
//   node work/vmv/edit-seq.mjs [path names…]
import { join } from 'node:path';
import { core, flatGround, loadApproach, plan, planRgb, hcat, vcat, save, ROOT, fidelity } from './vlib.mjs';
const { GRASS, STONE } = core;
const S = 16;
const WIN = [2, 2, 30, 30];
const line = (x0, z0, dx, dz, n) => { const c = []; for (let i = 0; i < n; i++) c.push([x0 + Math.round(i * dx), z0 + Math.round(i * dz)]); return c; };
// a 1-wide 4-connected pixel arc (radius r, centre c) from angle 0 to 90°, in drawing order
const arc = (cx, cz, r) => {
  const out = [], seen = new Set();
  for (let t = 0; t <= 400; t++) {
    const a = (t / 400) * Math.PI / 2;
    const p = [Math.round(cx + r * Math.cos(a) - 0.5), Math.round(cz + r * Math.sin(a) - 0.5)];
    const k = `${p[0]},${p[1]}`;
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  }
  return out;
};
const squareGrow = () => { const c = []; for (let s = 0; s < 6; s++) { for (let x = 0; x <= s; x++) c.push([13 + x, 13 + s]); for (let z = 0; z < s; z++) c.push([13 + s, 13 + z]); } return c; };
const PATHS = {
  'line-1:2': line(4, 8, 1, 0.5, 24),
  'line-1:3': line(4, 9, 1, 1 / 3, 24),
  'line-1:1': line(5, 5, 1, 1, 20),
  'arc-r10': arc(5, 5, 14),
  'square-grow': squareGrow(),
  'outline-7': (() => { const c = []; for (let x = 12; x < 19; x++) c.push([x, 12]); for (let z = 13; z < 19; z++) c.push([18, z]); for (let x = 17; x >= 12; x--) c.push([x, 18]); for (let z = 17; z > 12; z--) c.push([12, z]); return c; })(),
};
const want = process.argv.slice(2).filter((a) => !a.endsWith('.mjs'));
const apps = [await loadApproach('approaches/hints.mjs'), await loadApproach('approaches/mv-quad.mjs')];
for (const [pname, cells] of Object.entries(PATHS)) {
  if (want.length && !want.includes(pname)) continue;
  for (const A of apps) {
    let prev = null;
    const changes = [];
    let count = null;
    const strip = [];
    let maxReach = 0, farTotal = 0, farSteps = 0;
    const set = new Set();
    for (let k = 0; k <= cells.length; k++) {
      if (k > 0) set.add(`${cells[k - 1][0]},${cells[k - 1][1]}`);
      const pf = (x, z) => (set.has(`${x},${z}`) ? STONE : GRASS);
      const { img } = plan(A, flatGround(pf), WIN, S);
      if (!count) count = new Uint8Array(img.mat.length);
      if (prev) {
        const [px, pz] = cells[k - 1];
        let reach = 0, far = 0;
        for (let i = 0; i < img.mat.length; i++) {
          if (img.mat[i] === prev[i]) continue;
          count[i]++;
          const ii = i % img.W, jj = (i - ii) / img.W;
          const x = img.x0 + (ii + 0.5) / S, z = img.z0 + (jj + 0.5) / S;
          const dx = Math.max(px - x, 0, x - (px + 1)), dz = Math.max(pz - z, 0, z - (pz + 1));
          const d = Math.max(dx, dz);
          if (d > reach) reach = d;
          if (d > 2) far++;
        }
        far /= S * S;
        changes.push({ step: k, block: cells[k - 1], reach: +reach.toFixed(2), far: +far.toFixed(2) });
        maxReach = Math.max(maxReach, reach); farTotal += far; if (far > 0.05) farSteps++;
      }
      prev = img.mat.slice();
      strip.push(planRgb(img, { grid: false }));
      if (k === cells.length) {
        const f = fidelity(img, pf, WIN);
        let flick = 0;
        for (let i = 0; i < count.length; i++) if (count[i] >= 2) flick++;
        console.log(`${pname} [${cells.length} blocks] ${A.name}: max reach ${maxReach.toFixed(2)} blocks, far-changed area ${farTotal.toFixed(2)} blocks² over ${farSteps} of ${cells.length} steps, flicker ${(flick / (S * S)).toFixed(2)} blocks², final wrong ${f.wrong.toFixed(2)} blocks²`);
        if (A.name !== 'hints') console.log('   per step (step: reach / far): ' + changes.map((c) => `${c.step}: ${c.reach}/${c.far}`).join('  '));
      }
    }
    // filmstrip: rows of 8 frames
    const rows = [];
    for (let i = 0; i < strip.length; i += 8) rows.push(hcat(strip.slice(i, i + 8), 4));
    save(join(ROOT, 'out', 'vmv-adv', `edit-${pname}-${A.name}.png`), vcat(rows, 4));
  }
}
