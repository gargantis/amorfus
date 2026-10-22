// 3D validation of lib/mbo.mjs (FREE regime, jitter 0) against exact bubble
// geometry, measured on the final labels.
//   node validate3d.mjs <n> <s_blocks> <case,case,...>
// Cases: single, pair-same, cube2-same (spheres), pair-diff (1:1),
//        row-ABB (1:2), cube2-oneB (7:1), L3-ABC (triple line + tetra points).
// Writes val3d/n<n>-s<s>.json (merged by case).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { byName, A, B } from '../../lib/configs.mjs';
import { simulateKeep, facePoints, fitSphere, fitPlane, labelImage, junctions2D, anglesAt, junctionCensus, components } from './labtools.mjs';
import { sphereR, doubleBubble } from './exact.mjs';

const [nArg, sArg, casesArg, mArg] = process.argv.slice(2);
const n = +nArg, sb = +sArg, margin = mArg ? +mArg : 1;
const regime = { n, s: sb * n, maxSteps: 400, margin };
const CASES = {
  single: byName('single').blocks,
  'pair-same': byName('pair-same').blocks,
  'cube2-same': byName('cube2-same').blocks,
  'pair-diff': byName('pair-diff').blocks,
  'row-ABB': [[0, 0, 0, A], [1, 0, 0, B], [2, 0, 0, B]],
  'cube2-oneB': byName('cube2-oneB').blocks,
  'L3-ABC': byName('L3-ABC').blocks,
};
const SQ2PI = Math.sqrt(2 * Math.PI);
const r4 = (v) => (typeof v === 'number' ? +v.toFixed(4) : v);

/** Exact lambda of a ball of radius R under the continuous Gaussian
 *  threshold step (std s, blocks): lambda = 1 - 2 u(R), u = blurred
 *  indicator at the surface. 3D. */
function lambdaBall(R, s) {
  // u = int_{-2R}^{0} phi_s(x) (1 - exp(-(R^2 - (R + x)^2) / (2 s^2))) dx
  const N = 20000; let u = 0;
  for (let i = 0; i < N; i++) {
    const x = -2 * R + (2 * R * (i + 0.5)) / N;
    const phi = Math.exp(-(x * x) / (2 * s * s)) / (s * SQ2PI);
    u += phi * (1 - Math.exp(-(R * R - (R + x) * (R + x)) / (2 * s * s))) * (2 * R / N);
  }
  return 1 - 2 * u;
}

const alivePhases = (sim) => sim.phases.map((P, p) => (p && P.alive ? p : 0)).filter(Boolean);
const vol = (sim, p) => { let c = 0; for (let i = 0; i < sim.N; i++) if (sim.label[i] === p) c++; return c / sim.cellVol; };

function sphereCase(sim, name) {
  const ph = alivePhases(sim);
  const p = ph[0];
  const V = vol(sim, p);
  const f = fitSphere(facePoints(sim, p, 0));
  const R = sphereR(sim.phases[p].blocks);
  return {
    phases: ph.length, volume: V, exactR: R, fitR: f.r, fitRelErr: f.r / R - 1, fitRms: f.rms, fitMaxDev: f.maxDev,
    lambdaRun: sim.lambdaRun[p], lambdaPredLinear: (2 / R) * sb / SQ2PI, lambdaPredBall: lambdaBall(R, sb),
    curvRadiusFromLambda: (2 * sb) / (SQ2PI * sim.lambdaRun[p]),
  };
}

function doubleCase(sim, name) {
  const ph = alivePhases(sim);
  if (ph.length !== 2) return { error: `expected 2 phases, got ${ph.length}` };
  // order: smaller volume first
  let [p1, p2] = ph;
  if (sim.phases[p1].blocks > sim.phases[p2].blocks) [p1, p2] = [p2, p1];
  const V1 = sim.phases[p1].blocks, V2 = sim.phases[p2].blocks;
  const ex = doubleBubble(V1, V2, 3);
  const f1 = fitSphere(facePoints(sim, p1, 0)), f2 = fitSphere(facePoints(sim, p2, 0));
  const wallPts = facePoints(sim, p1, p2);
  const fw = fitSphere(wallPts), pw = fitPlane(wallPts);
  const axis = (() => { const d = f2.c.map((v, i) => v - f1.c[i]); const l = Math.hypot(...d); return d.map((v) => v / l); })();
  // signed projected wall area along the axis: exact pi a^2 for a cap
  const { NX, NY, label, n: nn } = sim;
  let S = 0;
  for (const q of wallPts) {
    // which side is p1? face at q, normal along axis q[3]; cell centres at q -/+ h/2
    const ax = q[3]; const lo = q.slice(0, 3); lo[ax] -= 0.5 / nn;
    const i = Math.floor((lo[0] - sim.ox) * nn), j = Math.floor((lo[1] - sim.oy) * nn), k = Math.floor((lo[2] - sim.oz) * nn);
    const lowIsP1 = label[(k * NY + j) * NX + i] === p1;
    S += (lowIsP1 ? 1 : -1) * axis[ax] / (nn * nn);
  }
  const aProj = Math.sqrt(Math.abs(S) / Math.PI);
  // junction from the two outer-sphere fits
  const d = Math.hypot(...f2.c.map((v, i) => v - f1.c[i]));
  const xj = (d * d + f1.r * f1.r - f2.r * f2.r) / (2 * d); // from c1 along axis
  const aFit = Math.sqrt(Math.max(0, f1.r * f1.r - xj * xj));
  const perp = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const pd = perp.map((v, i) => v - (perp[0] * axis[0] + perp[1] * axis[1] + perp[2] * axis[2]) * axis[i]);
  const pl = Math.hypot(...pd); const e2 = pd.map((v) => v / pl);
  const P = f1.c.map((v, i) => v + xj * axis[i] + aFit * e2[i]);
  const nA = P.map((v, i) => (v - f1.c[i]) / f1.r), nB = P.map((v, i) => (v - f2.c[i]) / f2.r);
  // wall normal (p1 -> p2) at P: sphere if the fit is curved and consistent with the axis, else plane
  const wallCurved = isFinite(fw.r) && fw.r < 50;
  let nW;
  if (wallCurved) {
    nW = P.map((v, i) => v - fw.c[i]); const l = Math.hypot(...nW); nW = nW.map((v) => v / l);
    const toward = (fw.c[0] - f1.c[0]) * axis[0] + (fw.c[1] - f1.c[1]) * axis[1] + (fw.c[2] - f1.c[2]) * axis[2];
    if (toward > xj) nW = nW.map((v) => -v); // centre on the p2 side: normal p1->p2 points toward the centre
  } else nW = pw.n.map((v) => v * Math.sign(pw.n[0] * axis[0] + pw.n[1] * axis[1] + pw.n[2] * axis[2]));
  const ang = (u, v) => (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * 180) / Math.PI;
  const sectorsFit = { air: 180 - ang(nA, nB), p1: 180 - ang(nA, nW), p2: 180 - ang(nB, nW.map((v) => -v)) };
  // tips along the axis line through the fitted centres: scan labels
  const along = (t) => f1.c.map((v, i) => v + t * axis[i]);
  const labAt = (x) => {
    const i = Math.floor((x[0] - sim.ox) * nn), j = Math.floor((x[1] - sim.oy) * nn), k = Math.floor((x[2] - sim.oz) * nn);
    if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= sim.NZ) return 0;
    return label[(k * NY + j) * NX + i];
  };
  let tmin = Infinity, tmax = -Infinity, twall = null;
  let prev = labAt(along(-3));
  for (let t = -3; t <= 6; t += 0.002) {
    const l = labAt(along(t));
    if (l === p1 && t < tmin) tmin = t;
    if (l === p2) tmax = t;
    if (prev === p1 && l === p2 && twall === null) twall = t;
    prev = l;
  }
  // local angles in two meridian slices (axis-aligned cases only)
  const local = [];
  const ai = axis.map(Math.abs).indexOf(Math.max(...axis.map(Math.abs)));
  if (Math.max(...axis.map(Math.abs)) > 0.99) {
    for (const sax of [0, 1, 2].filter((a) => a !== ai)) {
      const img = labelImage(sim, sax, f1.c[sax] + 0.25 / nn);
      for (const J of junctions2D(img)) if (J.labs.length === 3) local.push({ slice: sax, ...anglesAt(img, J, { rOut: 0.5 }) });
    }
  }
  const lam1 = sim.lambdaRun[p1], lam2 = sim.lambdaRun[p2];
  return {
    V: [V1, V2], volumes: [vol(sim, p1), vol(sim, p2)],
    exact: { r1: ex.r1, r2: ex.r2, rWall: ex.r3, a: ex.a, length: ex.length, wallToTip1: ex.wallToTip1, wallToTip2: ex.wallToTip2, sagitta: ex.h3 },
    meas: {
      r1: f1.r, r2: f2.r, r1rms: f1.rms, r2rms: f2.rms, rWallSphereFit: fw.r, wallRms: fw.rms, wallPlaneRms: pw.rms, wallPlaneMaxDev: pw.maxDev,
      aProjected: aProj, aFromOuterFits: aFit, length: tmax - tmin, wallToTip1: twall - tmin, wallToTip2: tmax - twall,
      youngLaplaceFromMeasuredR: f2.r > f1.r ? (f1.r * f2.r) / (f2.r - f1.r) : Infinity,
      sectorsFromFits: sectorsFit,
    },
    lambda: {
      run: [lam1, lam2], predOuter1: (2 / ex.r1) * sb / SQ2PI, predOuter2: (2 / ex.r2) * sb / SQ2PI,
      diffRun: lam1 - lam2, predDiffExactWall: isFinite(ex.r3) ? (2 / ex.r3) * sb / SQ2PI : 0,
      wallRadiusFromLambda: lam1 - lam2 > 0 ? (2 * sb) / (SQ2PI * (lam1 - lam2)) : Infinity,
    },
    localAngles: local,
  };
}

function tripleCase(sim) {
  const ph = alivePhases(sim);
  const res = { phases: ph.length, mats: ph.map((p) => sim.phases[p].mat) };
  const pairs = [];
  for (let i = 0; i < ph.length; i++) for (let j = i + 1; j < ph.length; j++) pairs.push([ph[i], ph[j], facePoints(sim, ph[i], ph[j]).length / (sim.n * sim.n)]);
  res.contactAreas = pairs.map(([a, b, ar]) => ({ a: sim.phases[a].mat, b: sim.phases[b].mat, area: +ar.toFixed(4) }));
  // plan slice (y = 0.5) angles at every triple point
  const img = labelImage(sim, 1, 0.5 + 0.25 / sim.n);
  res.planJunctions = junctions2D(img).map((J) => ({ J: { x: +J.x.toFixed(3), z: +J.y.toFixed(3), labs: J.labs.map((p) => (p ? sim.phases[p].mat : 0)) }, ...(J.labs.length === 3 ? anglesAt(img, J, { rOut: 0.5 }) : { four: true }) }));
  // tetrahedral vertices: corners where 4 phases meet; triple lines nearby
  const cen = junctionCensus(sim);
  res.census = { hist: cen.hist, quad: cen.quad.slice(0, 6) };
  const { NX, NY, NZ, n, label, ox, oy, oz } = sim;
  const lines = new Map();
  for (let k = 1; k < NZ; k++) for (let j = 1; j < NY; j++) for (let i = 1; i < NX; i++) {
    const s = new Set();
    for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) s.add(label[((k - dk) * NY + (j - dj)) * NX + (i - di)]);
    if (s.size !== 3) continue;
    const key = [...s].sort((a, b) => a - b).join(',');
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push([ox + i / n, oy + j / n, oz + k / n]);
  }
  res.tetra = [];
  for (const q of cen.quad.filter((c) => c.phases.length === 4)) {
    const V = q.at;
    const dirs = [];
    for (const [key, pts] of lines) {
      const near = pts.filter((p) => { const d = Math.hypot(p[0] - V[0], p[1] - V[1], p[2] - V[2]); return d > 0.04 && d < 0.4; });
      if (near.length < 8) continue;
      // fit p(t) = V' + a t + b t^2 with t = distance from V (least squares, 3 unknown vectors)
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (const p of near) {
        const t = Math.hypot(p[0] - V[0], p[1] - V[1], p[2] - V[2]);
        const row = [1, t, t * t];
        for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) M[a][b] += row[a] * row[b]; for (let c = 0; c < 3; c++) R[a][c] += row[a] * p[c]; }
      }
      // solve for each coordinate
      const coef = [0, 1, 2].map((c) => {
        // 3x3 solve
        const A = M.map((r) => r.slice()), b = R.map((r) => r[c]);
        const m = 3;
        for (let col = 0; col < m; col++) {
          let piv = col; for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
          [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
          for (let r = 0; r < m; r++) if (r !== col) { const f = A[r][col] / A[col][col]; for (let k2 = col; k2 < m; k2++) A[r][k2] -= f * A[col][k2]; b[r] -= f * b[col]; }
        }
        return b.map((v, i) => v / A[i][i]);
      });
      const a = [coef[0][1], coef[1][1], coef[2][1]];
      const l = Math.hypot(...a);
      dirs.push({ key: key.split(',').map((p) => (+p ? sim.phases[+p].mat : 0)).join(','), dir: a.map((v) => v / l), pts: near.length });
    }
    const angs = [];
    for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) {
      const c = dirs[i].dir.reduce((s, v, k) => s + v * dirs[j].dir[k], 0);
      angs.push({ lines: `${dirs[i].key} / ${dirs[j].key}`, deg: +((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI).toFixed(1) });
    }
    res.tetra.push({ at: V, corners: q.corners, extent: q.extent, lines: dirs.map((d) => ({ key: d.key, pts: d.pts })), angles: angs });
  }
  return res;
}

const outDir = new URL('./val3d/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const path = `${outDir}n${n}-s${sb}${margin !== 1 ? `-m${margin}` : ''}.json`;
const results = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { regime, cases: {} };
for (const name of casesArg.split(',')) {
  const sim = simulateKeep(CASES[name], regime);
  const base = { steps: sim.steps, converged: !!sim.converged, ms: Math.round(sim.ms), grid: [sim.NX, sim.NY, sim.NZ], lastChanges: sim.history.slice(-5) };
  const comps = alivePhases(sim).map((p) => ({ mat: sim.phases[p].mat, comps: components(sim, p).length }));
  let m;
  if (['single', 'pair-same', 'cube2-same'].includes(name)) m = sphereCase(sim, name);
  else if (name === 'L3-ABC') m = tripleCase(sim);
  else m = doubleCase(sim, name);
  results.cases[name] = JSON.parse(JSON.stringify({ ...base, comps, ...m }, (k, v) => r4(v)));
  console.log(name, JSON.stringify(results.cases[name]).slice(0, 600));
  writeFileSync(path, JSON.stringify(results, null, 1));
}
