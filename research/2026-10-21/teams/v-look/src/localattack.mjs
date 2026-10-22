// Attacks on local L9 (convex features context-free under FID-0.15) and
// local L12 (seam meets a convex edge: effect dies within 0.5 block).
//   node --max-old-space-size=700 src/localattack.mjs <L9|L12> <n>
// D0 = labels re-blurred with renderS = 0.125 n sub-cells and lambda = 0
// (local's local field), computed here independently; plus cell-exact labels.
import { writeFileSync } from 'node:fs';
import { simulate, gaussKernel, blur3, sampleGrid } from '../../../lib/mbo.mjs';
const V = new URL('..', import.meta.url).pathname;
const [task, nStr] = process.argv.slice(2); const n = +nStr;
const A = 6, B = 7;
const REG = { anchor: { kind: 'fidelity', k: 0.15 }, maxSteps: 300 };
const box = (x0, y0, z0, x1, y1, z1, m) => { const o = []; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) o.push([x, y, z, m]); return o; };

function D0of(sim, g = 1, eps = 0.05) {
  const { NX, NY, NZ, N } = sim;
  const ker = gaussKernel(0.125 * n);
  const live = []; for (let p = 1; p < sim.phases.length; p++) if (sim.phases[p].alive) live.push(p);
  const u = live.map((p) => { const a = new Float64Array(N); for (let c = 0; c < N; c++) a[c] = sim.label[c] === p ? 1 : 0; blur3(a, NX, NY, NZ, ker); return a; });
  const D0 = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    let Sall = 0; const Sm = {};
    live.forEach((p, q) => { Sall += u[q][c]; const m = sim.phases[p].mat; Sm[m] = (Sm[m] ?? 0) + u[q][c]; });
    let best = Infinity;
    live.forEach((p, q) => { const m = sim.phases[p].mat; const psi = (1 - Sall) + g * (Sall - Sm[m]) + eps * (Sm[m] - u[q][c]); if (u[q][c] > 1e-5 && psi < best) best = psi; });
    D0[c] = Sall - best;
  }
  return D0;
}
const topD = (sim, F, x, z, yTop, yBot) => { // highest y with F > 0 (bisection after a coarse scan)
  let y = yTop; const h = 1 / 256;
  while (y > yBot && !(sampleGrid(sim, F, x, y, z) > 0)) y -= h;
  if (y <= yBot) return null;
  let a = y, b = y + h; for (let i = 0; i < 30; i++) { const m = 0.5 * (a + b); if (sampleGrid(sim, F, x, m, z) > 0) a = m; else b = m; }
  return 0.5 * (a + b);
};
const topL = (sim, x, z) => { const i = Math.floor((x - sim.ox) * n), k = Math.floor((z - sim.oz) * n); for (let j = sim.NY - 1; j >= 0; j--) if (sim.label[(k * sim.NY + j) * sim.NX + i]) return sim.oy + (j + 1) / n; return null; };

const out = { task, n, regime: 'FID-0.15 (lib/mbo.mjs, maxSteps 300)', runs: {} };
if (task === 'L9') {
  // edge profiles: point on the edge line P (x, z) and inward direction (dx, dz); top height h0
  const hosts = {
    'slab5x2': { blocks: box(0, 0, 0, 4, 1, 4, A), P: [5, 2.5], dir: [-1, 0], h0: 2 },
    'slab5x3': { blocks: box(0, 0, 0, 4, 2, 4, A), P: [5, 2.5], dir: [-1, 0], h0: 3 },
    'slab8x2': { blocks: box(0, 0, 0, 7, 1, 4, A), P: [8, 2.5], dir: [-1, 0], h0: 2 },
    'ring6-outer': { blocks: box(0, 0, 0, 5, 1, 5, A).filter((b) => !(b[0] >= 2 && b[0] <= 3 && b[2] >= 2 && b[2] <= 3)), P: [6, 3], dir: [-1, 0], h0: 2 },
    'ring6-inner': null, // same sim as ring6-outer, rim of the hole at x = 2 looking +x
    'longL': { blocks: [...box(0, 0, 0, 7, 1, 1, A), ...box(0, 0, 2, 1, 1, 7, A)], P: [5, 2], dir: [0, -1], h0: 2 },
  };
  const ds = [0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75];
  let ringSim = null, ringD0 = null;
  for (const [name, H] of Object.entries(hosts)) {
    let sim, D0, P, dir, h0;
    if (name === 'ring6-inner') { sim = ringSim; D0 = ringD0; P = [2, 3]; dir = [-1, 0]; h0 = 2; }
    else { sim = simulate(H.blocks, { ...REG, n, margin: 0.5 }); D0 = D0of(sim); P = H.P; dir = H.dir; h0 = H.h0; if (name === 'ring6-outer') { ringSim = sim; ringD0 = D0; } }
    const prof = ds.map((d) => { const x = P[0] + dir[0] * d, z = P[1] + dir[1] * d; const hd = topD(sim, D0, x, z, h0 + 0.6, h0 - 1.5), hl = topL(sim, x, z); return { d, D0drop: hd == null ? null : +(h0 - hd).toFixed(5), labDrop: hl == null ? null : +(h0 - hl).toFixed(5) }; });
    const far = (() => { const x = P[0] + dir[0] * 1.0, z = P[1] + dir[1] * 1.0; return { D0: +(topD(sim, D0, x, z, h0 + 0.6, h0 - 1.5)).toFixed(5), lab: topL(sim, x, z) }; })();
    out.runs[name] = { steps: sim.steps, converged: !!sim.converged, far, prof };
    console.log(name, sim.steps, JSON.stringify(far), prof.map((p) => `${p.d}:${p.D0drop}/${p.labDrop}`).join(' '));
  }
  // differences vs the reference slab5x2 (raw and after removing each host's far-field level shift)
  const ref = out.runs.slab5x2;
  for (const [name, r] of Object.entries(out.runs)) {
    if (name === 'slab5x2') continue;
    const h0 = name === 'slab5x3' ? 3 : 2;
    const shift = (r.far.D0 - h0) - (ref.far.D0 - 2);
    r.maxDiffD0 = +Math.max(...r.prof.map((p, i) => Math.abs(p.D0drop - ref.prof[i].D0drop))).toFixed(5);
    r.maxDiffD0_shiftRemoved = +Math.max(...r.prof.map((p, i) => Math.abs((p.D0drop + shift) - ref.prof[i].D0drop))).toFixed(5);
    r.maxDiffLab = +Math.max(...r.prof.map((p, i) => Math.abs(p.labDrop - ref.prof[i].labDrop))).toFixed(5);
    console.log(name, 'max |D0 diff| vs slab5x2', r.maxDiffD0, 'after far-level shift', r.maxDiffD0_shiftRemoved, 'labels', r.maxDiffLab);
  }
}
if (task === 'L9b') {
  // the long L against a straight 8x2x2 bar: edge profile at x = 4, 5, 6 (edge z = 2), plus lambdas
  const hosts = { bar8x2x2: box(0, 0, 0, 7, 1, 1, A), longL: [...box(0, 0, 0, 7, 1, 1, A), ...box(0, 0, 2, 1, 1, 7, A)], slab8x2x5: box(0, 0, 0, 7, 1, 4, A) };
  const ds = [0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5];
  for (const [name, blocks] of Object.entries(hosts)) {
    const sim = simulate(blocks, { ...REG, n, margin: 0.5 });
    const D0 = D0of(sim);
    const zEdge = name === 'slab8x2x5' ? 5 : 2;
    const rows = [4, 5, 6].map((x) => ({ x, prof: ds.map((d) => ({ d, D0drop: +(2 - topD(sim, D0, x, zEdge - d, 2.6, 0.5)).toFixed(5), labDrop: +(2 - topL(sim, x, zEdge - d)).toFixed(5) })) }));
    const lam = sim.phases.filter((P, p) => p && P.alive).map((P) => +P.lambda.toFixed(5));
    out.runs[name] = { steps: sim.steps, converged: !!sim.converged, lambdaAfterFinish: lam, rows, farTopLab: topL(sim, 4, zEdge - 1) };
    console.log(name, sim.steps, 'lam', lam, 'far top', topL(sim, 4, zEdge - 1));
    for (const r of rows) console.log('  x', r.x, r.prof.map((p) => `${p.d}:${p.D0drop}/${p.labDrop}`).join(' '));
  }
}
if (task === 'L12') {
  // A|B slab, seam at x = 4; end faces at z = 0 and z = L. Top height of D0 along the seam vs distance from the end.
  for (const [name, L] of [['slab8x2x4', 4], ['slab8x2x8', 8]]) {
    const blocks = box(0, 0, 0, 7, 1, L - 1, A).map((b) => (b[0] >= 4 ? [b[0], b[1], b[2], B] : b));
    const sim = simulate(blocks, { ...REG, n, margin: 0.5 });
    const D0 = D0of(sim);
    const ds = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 1.0, 1.25, 1.5, 2.0];
    const farZ = L / 2;
    const farD = topD(sim, D0, 4, farZ, 2.6, 0.5), farA = topD(sim, D0, 2, farZ, 2.6, 0.5);
    const prof = ds.filter((d) => d <= L / 2).map((d) => {
      const hs = topD(sim, D0, 4, d, 2.6, 0.5), ha = topD(sim, D0, 2, d, 2.6, 0.5);
      return { d, seamDev: +(farD - hs).toFixed(5), awayDev: +(farA - ha).toFixed(5), extra: +((farD - hs) - (farA - ha)).toFixed(5), labSeam: topL(sim, 4 - 0.5 / n, d), labAway: topL(sim, 2, d) };
    });
    out.runs[name] = { steps: sim.steps, converged: !!sim.converged, farSeamD0: +farD.toFixed(5), farAwayD0: +farA.toFixed(5), prof };
    console.log(name, sim.steps, 'far seam', farD.toFixed(4), 'far A', farA.toFixed(4));
    for (const p of prof) console.log('  d', p.d, 'seam dev', p.seamDev, 'A-face dev', p.awayDev, 'extra', p.extra, 'lab seam/away', p.labSeam, p.labAway);
  }
}
writeFileSync(`${V}res/local-${task}@n${n}.json`, JSON.stringify(out, null, 1));
