// Task 3: combination rules (3D, n = 12).
// node task3.mjs <regime> <group: bridge|seamend|superpos>
//  bridge   : two A slabs 3x2x5 (or 3 + 6) with a one-block air gap; then the
//             gap bridged by one A block, or by one B block; diff vs separate.
//  seamend  : 8x2x4 slab, z<2 A, z>=2 B: groove across the seam at several
//             distances x from the end face x = 0; the notch on the end face.
//  superpos : 14x2x5 A slab, B inclusions (top layer, z = 2) at x = 4 and
//             x = 4 + s; residual of (both) - (one) - (other) + (base).
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { runSim, simInfo, labelDiff, surfaceShift, topD, seamsD, matGrid, fmt } from './lib/loc.mjs';
import { sampleGrid, finishLocal } from './lib/mbo-box.mjs';
const A = 6, B = 7;
const [regName, group] = process.argv.slice(2);
const N_SUB = 12;
const box = (x0, y0, z0, x1, y1, z1, m) => { const o = []; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) o.push([x, y, z, m]); return o; };
const range = (a, b, s) => { const o = []; for (let v = a; v <= b + 1e-9; v += s) o.push(+v.toFixed(4)); return o; };
mkdirSync(new URL('./res/t3', import.meta.url), { recursive: true });
const outPath = new URL(`./res/t3/${group}-${regName}.json`, import.meta.url);
const res = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { regName, group, n: N_SUB, runs: {} };
const save = () => writeFileSync(outPath, JSON.stringify(res));

function both(sim) { // returns [Dfull, D0] and leaves sim.D = D0, vals local
  const Df = sim.D; finishLocal(sim, sim.opts); return [Df, sim.D];
}

if (group === 'bridge') {
  for (const [tag, rightLen] of [['eq', 3], ['uneq', 6]]) {
    const left = box(0, 0, 0, 2, 1, 4, A), right = box(4, 0, 0, 3 + rightLen, 1, 4, A);
    const bbox = [0, 0, 0, 3 + rightLen, 1, 4];
    const variants = {
      sep: [...left, ...right],
      bridgeA: [...left, ...right, [3, 1, 2, A]],
      bridgeAcol: [...left, ...right, [3, 1, 2, A], [3, 0, 2, A]],
      bridgeB: [...left, ...right, [3, 1, 2, B]],
    };
    const sep = runSim(variants.sep, regName, { n: N_SUB, bbox });
    const [sepDf, sepD0] = both(sep);
    res.runs[`${tag}-sep`] = { info: simInfo(sep) };
    console.log(`${tag}-sep: ${sep.ms} ms ${sep.steps} st | ${simInfo(sep).phases.map((p) => `${p.mat}:${p.blocks} lam ${p.lamRun}`).join(' | ')}`);
    // left slab's far end profile (x = 0.5) and right slab's far end (x = 3 + rightLen + 0.5)
    const farPts = [[0.5, 2.5], [1.5, 2.5], [5.0, 2.5], [3 + rightLen + 0.5, 2.5], [1.5, 0.5]];
    const tops = (sim) => farPts.map(([x, z]) => fmt(topD(sim, x, z, 3, -0.5)));
    sep.D = sepDf; const sepTopF = tops(sep); sep.D = sepD0; const sepTop0 = tops(sep);
    for (const v of ['bridgeA', 'bridgeAcol', 'bridgeB']) {
      const sim = runSim(variants[v], regName, { n: N_SUB, bbox });
      const bb = v === 'bridgeAcol' ? [3, 0, 2, 4, 2, 3] : [3, 1, 2, 4, 2, 3];
      const ld = labelDiff(sep, sim, bb);
      sep.D = sepDf; const ss = surfaceShift(sep, sim, bb, { binW: 0.5 }); const topF = tops(sim);
      const [, D0] = both(sim); sep.D = sepD0;
      const ss0 = surfaceShift(sep, sim, bb, { binW: 0.5 }); const top0 = tops(sim);
      // seams around a B bridge (y = 1.5, z = 2.5 line along x)
      const seams = v === 'bridgeB' ? seamsD(sim, A, B, [0, 1.5, 2.5], 0, 2, 5) : null;
      res.runs[`${tag}-${v}`] = { info: simInfo(sim), labelDiff: ld, shiftBins: ss.bins, shiftBins0: ss0.bins, farPts,
        dTopFull: topF.map((t, i) => fmt(t - sepTopF[i])), dTop0: top0.map((t, i) => fmt(t - sepTop0[i])), seams };
      console.log(`${tag}-${v}: ${sim.ms} ms ${sim.steps} st | ${simInfo(sim).phases.map((p) => `${p.mat}:${p.blocks} lam ${p.lamRun}`).join(' | ')} | label diffs ${ld.count} max dist ${ld.maxDist} | dTop0 far ${JSON.stringify(res.runs[`${tag}-${v}`].dTop0)} dTopFull ${JSON.stringify(res.runs[`${tag}-${v}`].dTopFull)}`);
      save();
    }
  }
}

if (group === 'seamend') {
  for (const [tag, wa, wb] of [['sym', 2, 2], ['asym', 1, 3]]) {
    const blocks = []; for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 4; z++) blocks.push([x, y, z, z < wa ? A : B]);
    const sim = runSim(blocks, regName, { n: N_SUB });
    const zs = range(wa - 1, wa + 1, 0.02);
    const xsG = [0.04, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0];
    const meas = () => ({
      groove: xsG.map((x) => ({ x, h: zs.map((z) => fmt(topD(sim, x, z, 3, -0.5))) })),
      // end face x = 0: outward position of the surface (search from x = -0.8 inward) at height y, across z
      endFace: [1.0, 1.5, 1.9].map((y) => ({ y, x: zs.map((z) => { const step = 0.004; for (let x = -0.8; x < 1.5; x += step) if (sampleGrid(sim, sim.D, x, y, z) > 0) return fmt(x); return null; }) })),
      seamAtDepth: [0.1, 0.5, 1.0, 1.5, 1.9].map((y) => ({ y, z: [0.1, 0.5, 1, 2, 4].map((x) => ({ x, s: seamsD(sim, A, B, [x, y, 0], 2, wa - 1, wa + 1) })) })),
    });
    const mF = meas(); finishLocal(sim, sim.opts); const m0 = meas();
    res.runs[tag] = { info: simInfo(sim), wa, wb, zs, xsG, mF, m0 };
    console.log(`seamend-${tag}: ${sim.ms} ms ${sim.steps} st | ${simInfo(sim).phases.map((p) => `${p.mat}:${p.blocks}->${p.volume} lam ${p.lamRun}`).join(' | ')}`);
    save();
  }
}

if (group === 'superpos') {
  const LX = 14, LZ = 5;
  const slab = []; for (let x = 0; x < LX; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < LZ; z++) slab.push([x, y, z, A]);
  const bbox = [0, 0, 0, LX - 1, 1, LZ - 1];
  const incl = (xs) => slab.map((b) => (b[1] === 1 && b[2] === 2 && xs.includes(b[0]) ? [b[0], 1, 2, B] : b));
  const run = (blocks) => { const s = runSim(blocks, regName, { n: N_SUB, bbox }); const info = simInfo(s); const [Df, D0] = both(s); return { s, info, Df, D0, mat: matGrid(s) }; };
  const base = run(slab);
  const one = run(incl([4]));
  res.runs.base = { info: base.info }; res.runs.one = { info: one.info };
  for (const sep of [1, 2, 3, 4, 6]) {
    const two = run(incl([4 + sep]));
    const pair = run(incl([4, 4 + sep]));
    // residual over cells near the base surface (local field D0) and label residual
    const { NX, NY, NZ, n } = base.s;
    let maxR = 0, maxRat = null, labR = 0, maxEach = 0, nearR = 0, nearRat = null, nearLabR = 0;
    const nearBox = [4 - 1.5, 0.5, 2 - 1.5, 5 + sep + 1.5, 2 + 1.5, 3 + 1.5]; // within 1.5 blocks of either inclusion, top half only (the bottom face carries terraces)
    for (let c = 0; c < base.s.N; c++) {
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      if (i < 1 || j < 1 || k < 1 || i > NX - 2 || j > NY - 2 || k > NZ - 2) continue;
      // label residual: the pair's material differs from what superposing the singles predicts
      const pred = one.mat[c] !== base.mat[c] ? one.mat[c] : two.mat[c] !== base.mat[c] ? two.mat[c] : base.mat[c];
      const pc = [base.s.ox + (i + 0.5) / n, base.s.oy + (j + 0.5) / n, base.s.oz + (k + 0.5) / n];
      const isNear = pc[0] > nearBox[0] && pc[0] < nearBox[3] && pc[1] > nearBox[1] && pc[1] < nearBox[4] && pc[2] > nearBox[2] && pc[2] < nearBox[5];
      if (pair.mat[c] !== pred) { labR++; if (isNear) nearLabR++; }
      const Db = base.D0[c];
      if (Math.abs(Db) > 0.6) continue; // near the solid/air surface only
      const g = Math.hypot(base.D0[c + 1] - base.D0[c - 1], base.D0[c + NX] - base.D0[c - NX], base.D0[c + NX * NY] - base.D0[c - NX * NY]) * n / 2;
      if (g < 1e-3) continue;
      const r = (pair.D0[c] - two.D0[c] - one.D0[c] + Db) / g;
      const e = Math.max(Math.abs(one.D0[c] - Db), Math.abs(two.D0[c] - Db)) / g;
      if (isNear && Math.abs(r) > nearR) { nearR = Math.abs(r); nearRat = pc.map((v) => +v.toFixed(3)); }
      if (Math.abs(r) > maxR) { maxR = Math.abs(r); maxRat = [base.s.ox + (i + 0.5) / n, base.s.oy + (j + 0.5) / n, base.s.oz + (k + 0.5) / n].map((v) => +v.toFixed(3)); }
      maxEach = Math.max(maxEach, e);
    }
    res.runs[`sep${sep}`] = { sep, two: two.info, pair: pair.info, maxResidualD0: +maxR.toExponential(3), at: maxRat, maxSingleEffectD0: +maxEach.toExponential(3), labelResidualCells: labR, nearResidualD0: +nearR.toExponential(3), nearAt: nearRat, nearLabelResidualCells: nearLabR };
    console.log(`superpos sep ${sep}: residual (D0, blocks) ${maxR.toExponential(3)} at ${JSON.stringify(maxRat)}; single effects up to ${maxEach.toExponential(3)}; label residual cells ${labR}; NEAR (1.5 blocks) residual ${nearR.toExponential(3)} at ${JSON.stringify(nearRat)} label cells ${nearLabR}; pair lam ${pair.info.phases.map((p) => p.mat + ':' + p.lamRun).join(' ')}`);
    save();
  }
}
