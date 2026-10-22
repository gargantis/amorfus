// Is the engine's surface-tension matrix inside Esedoglu & Otto's (2015)
// stability class? Their Proposition 1: if sigma is conditionally negative
// semi-definite (x' sigma x <= 0 whenever sum x = 0), every threshold step
// dissipates the energy. Also checks the triangle inequality (needed for
// well-posedness). Phases: air + `m` materials x `k` clusters each, with
// sigma(solid, air) = 1, sigma(different materials) = g, sigma(same
// material, separate clusters) = eps, as in lib/mbo.mjs.
// Writes sigma-check.json. Pure arithmetic, no simulation.
import { writeFileSync } from 'node:fs';

function sigmaMatrix(m, k, g, eps) {
  const lab = [{ air: true }];
  for (let a = 0; a < m; a++) for (let c = 0; c < k; c++) lab.push({ mat: a });
  const N = lab.length;
  const S = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === j) continue;
    const A = lab[i], B = lab[j];
    S[i][j] = A.air || B.air ? 1 : A.mat === B.mat ? eps : g;
  }
  return S;
}

// Largest eigenvalue of P S P (P = projector onto sum-zero vectors) by
// power iteration on (P S P + c I) with a shift c that makes it positive.
function maxProjectedEig(S) {
  const N = S.length;
  const proj = (v) => { const mu = v.reduce((a, b) => a + b, 0) / N; return v.map((x) => x - mu); };
  const mul = (v) => S.map((row) => row.reduce((acc, s, j) => acc + s * v[j], 0));
  let c = 0; for (const row of S) c = Math.max(c, row.reduce((a, b) => a + Math.abs(b), 0));
  let v = proj(Array.from({ length: N }, (_, i) => Math.sin(i * 1.7 + 0.3)));
  let lam = 0;
  for (let it = 0; it < 5000; it++) {
    let w = proj(mul(v)).map((x, i) => x + c * v[i]);
    const nrm = Math.hypot(...w);
    w = w.map((x) => x / nrm);
    lam = nrm - c;
    v = w;
  }
  // Rayleigh quotient for accuracy
  const Sv = proj(mul(v));
  return Sv.reduce((a, x, i) => a + x * v[i], 0) / v.reduce((a, x) => a + x * x, 0);
}

function triangleOk(S) {
  const N = S.length; let worst = Infinity;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let l = 0; l < N; l++) {
    if (i === j || j === l || i === l) continue;
    worst = Math.min(worst, S[i][l] + S[l][j] - S[i][j]);
  }
  return worst; // >= 0 means the triangle inequality holds
}

const out = { note: 'max eigenvalue of sigma on sum-zero vectors; <= 0 means conditionally negative semi-definite (Esedoglu-Otto Prop. 1 applies)', rows: [] };
for (const g of [0.1, 0.25, 0.5, 1, 1.5, 1.9, 2, 2.5]) for (const [m, k] of [[2, 1], [2, 3], [4, 2], [7, 3]]) {
  const S = sigmaMatrix(m, k, g, 0.05);
  const e = maxProjectedEig(S);
  out.rows.push({ g, eps: 0.05, materials: m, clustersEach: k, phases: S.length, maxEig: +e.toFixed(5), cnsd: e <= 1e-9, triangleSlack: +triangleOk(S).toFixed(4) });
}
writeFileSync(new URL('./sigma-check.json', import.meta.url), JSON.stringify(out, null, 1));
for (const r of out.rows) console.log(JSON.stringify(r));
