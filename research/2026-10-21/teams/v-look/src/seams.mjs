// Verifier v-look, attack (b): seams on LABELS vs the render field D.
//   node --max-old-space-size=700 src/seams.mjs <REGIME> <n> [g] [scenes]
// Scenes: halves4 (4x1x4 slab, A x<2 | B x>=2, seam at x = 2), pair-diff
// (double bubble), sq2-AABC (T junction of three materials).
// Writes res/seams-<REGIME>-g<g>@n<n>.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../../lib/mbo.mjs';
import { simulate as simulateLook } from '../../look/src/mbo-look.mjs';
import { byName, A, B } from '../../../lib/configs.mjs';
import * as LM from '../../look/src/lm.mjs';
import { renderSlice, savePng } from '../../../lib/render.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const [reg, nStr, gStr = '1', scenesArg = 'halves4,pair-diff,sq2-AABC'] = process.argv.slice(2);
const n = +nStr, g = +gStr;
const fl = (v) => Math.floor(v * n + 1e-9) / n;
const REG = {
  'FID-0.15': { anchor: { kind: 'fidelity', k: 0.15 } },
  'FID-0.05': { anchor: { kind: 'fidelity', k: 0.05 } },
  'FINITE-4': { maxSteps: 4, stopAfter: 99 },
  'CAGE-0.25': { anchor: { kind: 'cage', r: 0.25 } },
  FREE: { maxSteps: 400 },
  'C15-V0': { engine: 'look', anchor: { kind: 'fidelity', k: 0.15, kMat: 0.02, box: { outH: fl(0.15), outV: 0, inH: 0.25, inV: 0.25 } } },
  'C15-V05': { engine: 'look', anchor: { kind: 'fidelity', k: 0.15, kMat: 0.02, box: { outH: fl(0.15), outV: fl(0.05), inH: 0.25, inV: 0.25 } } },
};
const plan = (rows) => { const out = []; rows.forEach((row, z) => [...row].forEach((ch, x) => { if (ch === 'A') out.push([x, 0, z, A]); if (ch === 'B') out.push([x, 0, z, B]); })); return out; };
const SCENES = {
  halves4: { blocks: plan(Array(4).fill('AABB')), seam: 2, zc: 2, top: 1, flatL: [0.5, 1.25], flatR: [2.75, 3.5], margin: reg === 'FREE' ? 1 : 0.5 },
  'pair-diff': { blocks: byName('pair-diff').blocks, seam: 1, zc: 0.5, top: 1, margin: 1 },
  'sq2-AABC': { blocks: byName('sq2-AABC').blocks, margin: reg === 'FREE' ? 1 : 0.5 },
};

// Phi, PhiInv (closed-form check of local L11, generalised to any g)
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
const PhiInv = (p) => { let lo = -8, hi = 8; for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); if (Phi(m) < p) lo = m; else hi = m; } return 0.5 * (lo + hi); };
const sig = 0.125;
const depthLocal = (x) => sig * PhiInv(1 / (1 + Phi(Math.abs(x) / sig))); // local L11 (g = 1)
const depthG = (x, gg) => sig * PhiInv(1 / (2 - gg + gg * Phi(Math.abs(x) / sig))); // same derivation, any g
// with the render re-solve's pressure lam (phase cost psi - lam): u = (1 - lam)/(2 - g + g Phi), depth below the far flat
const depthGL = (x, gg, lam) => sig * (PhiInv((1 - lam) / (2 - gg + gg * Phi(Math.abs(x) / sig))) - PhiInv((1 - lam) / 2));

/** Label top height of the column containing (x, z) (cell exact). */
function labTop(sim, x, z, yMax = 2) {
  const i = Math.floor((x - sim.ox) * sim.n), k = Math.floor((z - sim.oz) * sim.n);
  for (let j = Math.min(sim.NY - 1, Math.floor((yMax - sim.oy) * sim.n)); j >= 0; j--) if (sim.label[(k * sim.NY + j) * sim.NX + i]) return sim.oy + (j + 1) / sim.n;
  return null;
}
const slope = (pts) => LM.slope(pts);
function grooveLab(sim, xs, zc, flatL, flatR) {
  const prof = [];
  for (let i = 0; i < sim.NX; i++) { const x = sim.ox + (i + 0.5) / sim.n; if (Math.abs(x - xs) > 2.5) continue; const y = labTop(sim, x, zc); if (y != null) prof.push([x, y]); }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const near = prof.filter(([x]) => Math.abs(x - xs) <= 0.5);
  const low = near.reduce((m, p) => (p[1] < m[1] ? p : m), [xs, Infinity]);
  let flat = null;
  if (flatL) flat = 0.5 * (mean(prof.filter(([x]) => x >= flatL[0] && x <= flatL[1]).map((p) => p[1])) + mean(prof.filter(([x]) => x >= flatR[0] && x <= flatR[1]).map((p) => p[1])));
  const ang = [[0.06, 0.25], [0.1, 0.4]].map(([w0, w1]) => {
    const L = prof.filter(([x]) => x <= xs - w0 && x >= xs - w1), R = prof.filter(([x]) => x >= xs + w0 && x <= xs + w1);
    const sL = slope(L), sR = slope(R);
    const pL = sL == null ? null : (Math.atan(-sL) * 180) / Math.PI, pR = sR == null ? null : (Math.atan(sR) * 180) / Math.PI;
    return { window: [w0, w1], opening: pL == null || pR == null ? null : +(180 - pL - pR).toFixed(2) };
  });
  return { flat, depth: flat == null ? null : +(flat - low[1]).toFixed(4), lowAt: +(low[0] - xs).toFixed(4), angles: ang,
    profile: prof.filter(([x]) => Math.abs(x - xs) <= 0.6).map(([x, y]) => [+(x - xs).toFixed(4), +y.toFixed(4)]) };
}
// sq2-AABC junction angles on labels: least-squares seam lines in the plan y = 0.5
function junctionLab(sim) {
  const mat = (x, z) => { const i = Math.floor((x - sim.ox) * sim.n), j = Math.floor((0.5 - sim.oy) * sim.n), k = Math.floor((z - sim.oz) * sim.n); const p = sim.label[(k * sim.NY + j) * sim.NX + i]; return p ? sim.phases[p].mat : 0; };
  const ptsAB = [], ptsAC = [], ptsBC = [];
  for (let i = 0; i < sim.NX; i++) {
    const x = sim.ox + (i + 0.5) / sim.n;
    if (x > 0.2 && x < 0.9) for (let k = 1; k < sim.NZ; k++) { const z0 = sim.oz + (k - 0.5) / sim.n, z1 = sim.oz + (k + 0.5) / sim.n; if (mat(x, z0) === A && mat(x, z1) === B) ptsAB.push([x, sim.oz + k / sim.n]); }
    if (x > 1.1 && x < 1.8) for (let k = 1; k < sim.NZ; k++) { const z0 = sim.oz + (k - 0.5) / sim.n, z1 = sim.oz + (k + 0.5) / sim.n; if (mat(x, z0) === A && mat(x, z1) === 1) ptsAC.push([x, sim.oz + k / sim.n]); }
  }
  for (let k = 0; k < sim.NZ; k++) {
    const z = sim.oz + (k + 0.5) / sim.n;
    if (z > 1.1 && z < 1.8) for (let i = 1; i < sim.NX; i++) { const x0 = sim.ox + (i - 0.5) / sim.n, x1 = sim.ox + (i + 0.5) / sim.n; if (mat(x0, z) === B && mat(x1, z) === 1) ptsBC.push([z, sim.ox + i / sim.n]); }
  }
  const sAB = slope(ptsAB), sAC = slope(ptsAC), sBC = slope(ptsBC);
  if (sAB == null || sAC == null || sBC == null) return { note: 'seam missing', nAB: ptsAB.length, nAC: ptsAC.length, nBC: ptsBC.length };
  const dAB = [-1, -sAB], dAC = [1, sAC], dBC = [sBC, 1]; // pointing away from the junction near (1, 1)
  const ang = (a, b) => +((Math.acos((a[0] * b[0] + a[1] * b[1]) / Math.hypot(...a) / Math.hypot(...b)) * 180) / Math.PI).toFixed(1);
  return { AB_AC: ang(dAB, dAC), AB_BC: ang(dAB, dBC), AC_BC: ang(dAC, dBC), slopes: [sAB, sAC, sBC].map((v) => +v.toFixed(4)), npts: [ptsAB.length, ptsAC.length, ptsBC.length] };
}

const out = { regime: reg, n, g, runs: {} };
mkdirSync(join(HERE, 'img', 'seams'), { recursive: true });
for (const name of scenesArg.split(',')) {
  const sc = SCENES[name];
  const { engine, ...opts } = REG[reg];
  const t0 = performance.now();
  const sim = (engine === 'look' ? simulateLook : simulate)(sc.blocks, { ...opts, n, g, margin: sc.margin });
  const r = { steps: sim.steps, converged: !!sim.converged, ms: Math.round(performance.now() - t0), cells: sim.N };
  const F = LM.fields(sim);
  if (name === 'halves4' || name === 'pair-diff') {
    const xs = sc.seam, zc = sc.zc;
    r.lab = grooveLab(sim, xs, zc, sc.flatL, sc.flatR);
    const gD = LM.groove(F.D, xs, zc, sc.top, { flatL: sc.flatL ?? [xs - 0.3, xs - 0.2], flatR: sc.flatR ?? [xs + 0.2, xs + 0.3], yTop: 2, yBot: -1 });
    r.D = { flat: gD.flatL != null ? 0.5 * (gD.flatL + gD.flatR) : null, depth: gD.depth, lowestAt: gD.lowestAt, angles: gD.angles.map((a) => ({ window: a.window, opening: a.opening == null ? null : +a.opening.toFixed(2) })) };
    // fast C12's dip definition, on both fields
    const hD = (x) => LM.topY(F.D, x, zc, 2, -1), hL = (x) => labTop(sim, x, zc);
    r.dipD = +(0.5 * (hD(xs - 0.25) + hD(xs + 0.25)) - hD(xs)).toFixed(4);
    r.dipLab = +(0.5 * (hL(xs - 0.25) + hL(xs + 0.25)) - hL(xs - 0.5 / n)).toFixed(4);
    if (name === 'halves4') {
      // closed-form check: D groove below the D flat level vs local's formula and the g-general one
      const flatD = r.D.flat;
      r.closedForm = [0, 0.02, 0.04, 0.08, 0.12, 0.16, 0.2, 0.28].map((x) => {
        const y = LM.topY(F.D, xs + x, zc, 2, -1);
        const lam = sim.phases.filter((P, p) => p && P.alive).map((P) => P.lambda);
        return { x, measured: +(flatD - y).toFixed(5), localL11: +depthLocal(x).toFixed(5), gModel: +depthG(x, g).toFixed(5), gLamModel: +depthGL(x, g, lam[0]).toFixed(5) };
      });
      r.labFlatVsBlock = r.lab.flat == null ? null : +(r.lab.flat - 1).toFixed(4);
      r.Dflat = flatD;
      r.renderLambdas = sim.phases.filter((P, p) => p && P.alive).map((P) => +P.lambda.toFixed(5));
      r.DflatModel = +(1 - sig * PhiInv((1 - r.renderLambdas[0]) / 2)).toFixed(5);
    }
    savePng(join(HERE, 'img', 'seams', `${name}-${reg}-g${g}@n${n}-sec.png`), renderSlice(sim, { axis: 2, at: zc, ppb: 60 }));
  }
  if (name === 'sq2-AABC') {
    r.junctionLab = junctionLab(sim);
    savePng(join(HERE, 'img', 'seams', `${name}-${reg}-g${g}@n${n}-plan.png`), renderSlice(sim, { axis: 1, at: 0.5, ppb: 60 }));
  }
  out.runs[name] = r;
  console.log(reg, `n${n}`, `g${g}`, name, JSON.stringify({ ...r, lab: r.lab ? { ...r.lab, profile: undefined } : undefined }).slice(0, 700));
}
writeFileSync(join(HERE, 'res', `seams-${reg}-g${g}@n${n}.json`), JSON.stringify(out, null, 1));
