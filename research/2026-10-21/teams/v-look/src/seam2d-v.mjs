// v-look copy of teams/look/src/seam2d.mjs, changed to a 4x1 slab (seam x = 2), margin 0.5, n up to 256.
// Team "look": the A|B seam on a flat top, and the Neumann angle, in 2D.
// The 2D domain is the cross-section of a long straight seam: a slab 6 wide
// and 1 thick, A for x < 3, B for x ≥ 3 (x right, y up).
//   node --max-old-space-size=700 src/seam2d.mjs <out.json> <imgDir>
// Neumann: three tensions σ(A,air) = σ(B,air) = 1 and σ(A,B) = g balance at
// the triple point. By symmetry the film is vertical; each air surface leaves
// the junction at φ above the horizontal with 2 sin φ = g, so φ = asin(g/2)
// and the groove's opening angle (through air) is 180° − 2φ.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { simulate } from '../../../lib/mbo.mjs';
import { renderSlice, savePng } from '../../../lib/render.mjs';
import { fitCircle, slope } from '../../look/src/lm.mjs';

const [outPath, imgDir] = process.argv.slice(2);
mkdirSync(imgDir, { recursive: true });
const A = 6, B = 7;
const blocks = [0, 1, 2, 3].map((x) => [x, 0, 0, x < 2 ? A : B]); // v-look: 4x1 slab, seam at x = 2
const neumann = (g) => { const phi = (Math.asin(g / 2) * 180) / Math.PI; return { phi, opening: 180 - 2 * phi }; };

function columns(sim) {
  // top of the solid in each column (labels), and the material there
  const { NX, NY, n, ox, oy, label, phases } = sim;
  const out = [];
  for (let i = 0; i < NX; i++) {
    let top = null, mat = 0;
    for (let j = NY - 1; j >= 0; j--) { const l = label[j * NX + i]; if (l) { top = oy + (j + 1) / n; mat = phases[l].mat; break; } }
    out.push({ x: ox + (i + 0.5) / n, top, mat });
  }
  return out;
}

function grooveLab(sim) {
  const cols = columns(sim).filter((c) => c.top != null);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const flat = mean(cols.filter((c) => (c.x > 0.5 && c.x < 1.25) || (c.x > 2.75 && c.x < 3.5)).map((c) => c.top));
  const near = cols.filter((c) => Math.abs(c.x - 2) < 0.3);
  const low = Math.min(...near.map((c) => c.top));
  const ang = [[0.03, 0.15], [0.05, 0.25], [0.1, 0.4]].map(([w0, w1]) => {
    const Lp = cols.filter((c) => c.x <= 2 - w0 && c.x >= 2 - w1).map((c) => [c.x, c.top]);
    const Rp = cols.filter((c) => c.x >= 2 + w0 && c.x <= 2 + w1).map((c) => [c.x, c.top]);
    const pL = (Math.atan(-slope(Lp)) * 180) / Math.PI, pR = (Math.atan(slope(Rp)) * 180) / Math.PI;
    return { window: [w0, w1], phiL: pL, phiR: pR, opening: 180 - pL - pR };
  });
  // half-width: first column right of the seam within one sub-cell of flat
  const right = cols.filter((c) => c.x > 2).find((c) => c.top >= flat - 1 / sim.n);
  return { flatVsOrig: flat - 1, depth: flat - low, halfWidth: right ? right.x - 2 : null, angles: ang };
}

/** FREE double bubble: fit A's outer arc, read φ from the arc centre's
 *  distance to the wall: sin φ = c / R (c > 0 when the centre lies on A's side). */
function doubleBubble(sim) {
  const { NX, NY, n, ox, oy, label, phases } = sim;
  const mat = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NY ? 0 : label[j * NX + i] ? phases[label[j * NX + i]].mat : 0);
  const wall = [], arcA = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (mat(i, j) !== A) continue;
    if (mat(i + 1, j) === B) wall.push([ox + (i + 1) / n, oy + (j + 0.5) / n]);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mat(i + di, j + dj) === 0) arcA.push([ox + (i + 0.5 + di / 2) / n, oy + (j + 0.5 + dj / 2) / n]);
  }
  if (!wall.length) return null;
  const xw = wall.reduce((s, p) => s + p[0], 0) / wall.length;
  const yTop = Math.max(...wall.map((p) => p[1])), yBot = Math.min(...wall.map((p) => p[1]));
  const away = arcA.filter(([x, y]) => Math.hypot(x - xw, y - yTop) > 0.3 && Math.hypot(x - xw, y - yBot) > 0.3);
  const fit = fitCircle(away);
  const c = xw - fit.cx; // centre left of the wall = on A's side (A is left)
  const phi = (Math.asin(Math.max(-1, Math.min(1, c / fit.R))) * 180) / Math.PI;
  return { wallX: xw, wallLength: yTop - yBot + 1 / n, R: fit.R, fitRms: fit.rms, c, phi, opening: 180 - 2 * phi, wallTilt: slope(wall.map(([x, y]) => [y, x])) };
}

const runs = [];
const regs = [
  ['FREE', { maxSteps: 600 }],
  ['FID-0.15', { anchor: { kind: 'fidelity', k: 0.15 } }],
  ['FID-0.1', { anchor: { kind: 'fidelity', k: 0.1 } }],
  ['FID-0.05', { anchor: { kind: 'fidelity', k: 0.05 } }],
  ['FINITE-4', { maxSteps: 4, stopAfter: 99 }],
  ['CAGE-0.25', { anchor: { kind: 'cage', r: 0.25 } }],
];
const plan = [['FREE', regs[0][1], 1, 64], ['FREE', regs[0][1], 1, 128], ['FREE', regs[0][1], 1, 256], ['FID-0.15', regs[1][1], 1, 128], ['FID-0.15', regs[1][1], 1, 256]];
for (const [name, o, g, n] of plan) {
  const t0 = performance.now();
  const sim = simulate(blocks, { ...o, g, n, dims: 2, maxSteps: o.maxSteps ?? 300, margin: 0.5 });
  const ms = Math.round(performance.now() - t0);
  const r = { regime: name, g, n, steps: sim.steps, converged: !!sim.converged, ms, neumann: neumann(g) };
  if (name === 'FREE') r.doubleBubble = doubleBubble(sim);
  else r.groove = grooveLab(sim);
  runs.push(r);
  if (n === 256) savePng(join(imgDir, `seam2d-${name}-g${g}.png`), renderSlice(sim, { axis: 2, at: 0.5, ppb: 64 }));
  console.log(JSON.stringify(r));
  writeFileSync(outPath, JSON.stringify({ note: '2D cross-section of a straight A|B seam in a 6×1 slab (labels); n sub-cells per block, s = 0.2·n', runs }, null, 1));
}
