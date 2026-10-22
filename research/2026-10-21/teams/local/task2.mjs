// Task 2: context dependence. A fixed local neighbourhood embedded in
// clusters of different sizes/shapes; measure the local shape and lambda.
// node task2.mjs <regime> <group: seam|edge|incl|lam> [n]
// 3D, n = 12 unless given (see REPORT).
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { runSim, simInfo, topD, topLabel, seamsD, seamLabel, fmt } from './lib/loc.mjs';
import { sampleGrid, finishLocal } from './lib/mbo-box.mjs';
const A = 6, B = 7;
const [regName, group, nArg] = process.argv.slice(2);
const N_SUB = nArg ? +nArg : 12;
const box = (x0, y0, z0, x1, y1, z1, m) => { const o = []; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) o.push([x, y, z, m]); return o; };
const range = (a, b, s) => { const o = []; for (let v = a; v <= b + 1e-9; v += s) o.push(+v.toFixed(4)); return o; };

// side position along +x at height y, depth z: last solid crossing going +x
const sideX = (sim, y, z, x0, x1) => {
  const step = 0.004; let prev = sampleGrid(sim, sim.D, x0, y, z) > 0;
  for (let x = x0 + step; x <= x1; x += step) { const s = sampleGrid(sim, sim.D, x, y, z) > 0; if (s !== prev && prev) return fmt(x - step / 2); prev = s; }
  return null;
};

const configs = {
  // N1: flat-top A|B seam, seam plane x = 0; A in x in [-a, 0), B in [0, b); y 0..1; z 0..L-1. Measured at z = zc.
  seam: [
    ['a1b1L4', 1, 1, 4], ['a2b2L4', 2, 2, 4], ['a3b3L4', 3, 3, 4], ['a5b5L4', 5, 5, 4], ['a2b5L4', 2, 5, 4], ['a5b2L4', 5, 2, 4],
    ['a2b2L8', 2, 2, 8], ['a3b3L6', 3, 3, 6],
  ].map(([name, a, b, L]) => ({ name: 'seam-' + name, blocks: [...box(-a, 0, 0, -1, 1, L - 1, A), ...box(0, 0, 0, b - 1, 1, L - 1, B)], zc: L / 2, a, b, L, kind: 'seam' }))
    .concat([{ name: 'seam-a2b2L4-Ahook', kind: 'seam', zc: 2, a: 2, b: 2, L: 4,
      // same 2x2x4 | 2x2x4 seam, A cluster extended by a hook far from the measured line (an L-shaped A cluster of 28 blocks)
      blocks: [...box(-2, 0, 0, -1, 1, 3, A), ...box(0, 0, 0, 1, 1, 3, B), ...box(-5, 0, 0, -3, 1, 1, A), ...box(-5, 0, -3, -4, 1, -1, A)] }]),
  // N2: convex top edge of an A slab k x 2 x L at x = k; measured at z = L/2
  edge: [
    ['k1L4', 1, 4], ['k2L4', 2, 4], ['k3L4', 3, 4], ['k5L4', 5, 4], ['k8L4', 8, 4], ['k3L8', 3, 8],
  ].map(([name, k, L]) => ({ name: 'edge-' + name, blocks: box(0, 0, 0, k - 1, 1, L - 1, A), k, L, zc: L / 2, kind: 'edge' }))
    .concat([{ name: 'edge-k3L4-hook', kind: 'edge', k: 3, L: 4, zc: 2, blocks: [...box(0, 0, 0, 2, 1, 3, A), ...box(-3, 0, 0, -1, 1, 1, A), ...box(-3, 0, -3, -2, 1, -1, A)] },
      { name: 'edge-cube3', kind: 'edge', k: 3, L: 3, zc: 1.5, blocks: box(0, 0, 0, 2, 2, 2, A), top: 3 }]),
  // N3: one B block in the top layer of an A slab; measured through its centre
  incl: [3, 5, 7].map((k) => ({ name: `incl-slab${k}`, kind: 'incl', k, c: Math.floor(k / 2),
    blocks: box(0, 0, 0, k - 1, 1, k - 1, A).map((b) => (b[0] === Math.floor(k / 2) && b[2] === Math.floor(k / 2) && b[1] === 1 ? [b[0], 1, b[2], B] : b)) }))
    .concat([{ name: 'incl-bar3x2x9', kind: 'incl', k: 3, c: 1, cz: 4, blocks: box(0, 0, 0, 2, 1, 8, A).map((b) => (b[0] === 1 && b[2] === 4 && b[1] === 1 ? [1, 1, 4, B] : b)) }]),
  // N4: a pit (top-layer block removed) and N5: a bump (block on top), at the centre of A slabs of growing size
  pit: [3, 5, 7].map((k) => ({ name: `pit-slab${k}`, kind: 'pit', k, c: Math.floor(k / 2),
    blocks: box(0, 0, 0, k - 1, 1, k - 1, A).filter((b) => !(b[0] === Math.floor(k / 2) && b[2] === Math.floor(k / 2) && b[1] === 1)) }))
    .concat([{ name: 'pit-bar3x2x9', kind: 'pit', k: 3, c: 1, cz: 4, blocks: box(0, 0, 0, 2, 1, 8, A).filter((b) => !(b[0] === 1 && b[2] === 4 && b[1] === 1)) },
      { name: 'pit-slab5-bump', kind: 'pit', k: 5, c: 2, blocks: [...box(0, 0, 0, 4, 1, 4, A).filter((b) => !(b[0] === 2 && b[2] === 2 && b[1] === 1)), [0, 2, 0, A]], note: 'pit-slab5 plus a bump on a far corner block' }]),
  bump: [3, 5, 7].map((k) => ({ name: `bump-slab${k}`, kind: 'bump', k, c: Math.floor(k / 2),
    blocks: [...box(0, 0, 0, k - 1, 1, k - 1, A), [Math.floor(k / 2), 2, Math.floor(k / 2), A]] }))
    .concat([{ name: 'bump-bar3x2x9', kind: 'bump', k: 3, c: 1, cz: 4, blocks: [...box(0, 0, 0, 2, 1, 8, A), [1, 2, 4, A]] },
      { name: 'bump-slab5-pit', kind: 'bump', k: 5, c: 2, blocks: [...box(0, 0, 0, 4, 1, 4, A).filter((b) => !(b[0] === 0 && b[2] === 0 && b[1] === 1)), [2, 2, 2, A]], note: 'bump-slab5 plus a pit at a far corner' }]),
  // N6: a 1x1x3 pillar standing alone, and on 1-thick A plates of growing size
  pillar: [{ name: 'pillar-alone', kind: 'pillar', c: 0, blocks: box(0, 1, 0, 0, 3, 0, A) }]
    .concat([3, 5, 7].map((k) => ({ name: `pillar-on-plate${k}`, kind: 'pillar', c: Math.floor(k / 2),
      blocks: [...box(0, 0, 0, k - 1, 0, k - 1, A), ...box(Math.floor(k / 2), 1, Math.floor(k / 2), Math.floor(k / 2), 3, Math.floor(k / 2), A)] }))),
  // lambda against size and shape (one material)
  lam: [
    ...[1, 2, 3, 4].map((k) => ({ name: `cube${k}`, blocks: box(0, 0, 0, k - 1, k - 1, k - 1, A), dims: [k, k, k] })),
    ...[2, 3, 5, 7].map((k) => ({ name: `slab${k}x2x${k}`, blocks: box(0, 0, 0, k - 1, 1, k - 1, A), dims: [k, 2, k] })),
    ...[2, 4, 6].map((k) => ({ name: `plate${k}x1x${k}`, blocks: box(0, 0, 0, k - 1, 0, k - 1, A), dims: [k, 1, k] })),
    ...[2, 4, 8].map((L) => ({ name: `bar1x1x${L}`, blocks: box(0, 0, 0, L - 1, 0, 0, A), dims: [L, 1, 1] })),
    ...[3, 6].map((L) => ({ name: `bar2x2x${L}`, blocks: box(0, 0, 0, L - 1, 1, 1, A), dims: [L, 2, 2] })),
    { name: 'L-slab', blocks: [...box(0, 0, 0, 4, 1, 1, A), ...box(0, 0, 2, 1, 1, 4, A)], dims: null },
  ].map((c) => ({ ...c, kind: 'lam' })),
};

function measure(sim, c) {
  if (c.kind === 'seam') {
    const xs = range(-1, 1, 0.04);
    return {
      groove: xs.map((x) => fmt(topD(sim, x, c.zc, 3, -0.5))), grooveX: xs,
      grooveLab: xs.map((x) => fmt(topLabel(sim, x, c.zc))),
      seamY: [1.9, 1.5, 1.0, 0.5, 0.1].map((y) => ({ y, x: seamsD(sim, A, B, [0, y, c.zc], 0, -0.9, 0.9) })),
      seamYLab: [1.5, 1.0, 0.5].map((y) => ({ y, x: fmt(seamLabel(sim, A, B, [0, y, c.zc], 0, -0.9, 0.9)) })),
      flatA: fmt(topD(sim, -c.a / 2, c.zc, 3, -0.5)), flatB: fmt(topD(sim, c.b / 2, c.zc, 3, -0.5)),
    };
  }
  if (c.kind === 'edge') {
    const top = c.top ?? 2;
    const xs = range(c.k - 1, c.k + 0.3, 0.025);
    return { prof: xs.map((x) => fmt(topD(sim, x, c.zc, top + 1, -0.5))), profX: xs, profLab: xs.map((x) => fmt(topLabel(sim, x, c.zc))),
      side: [0.25, 0.5, 1.0, 1.5, 1.75].map((y) => ({ y, x: sideX(sim, y * top / 2, c.zc, c.k - 1, c.k + 0.6) })) };
  }
  if (c.kind === 'incl') {
    const cz = (c.cz ?? c.c) + 0.5, cx = c.c + 0.5;
    const xs = range(c.c - 1, c.c + 2, 0.04);
    return { prof: xs.map((x) => fmt(topD(sim, x, cz, 3, -0.5))), profX: xs,
      seams15: seamsD(sim, A, B, [0, 1.5, cz], 0, c.c - 1, c.c + 2), seams19: seamsD(sim, A, B, [0, 1.9, cz], 0, c.c - 1, c.c + 2),
      seamsDepth: seamsD(sim, A, B, [cx, 0, cz], 1, 0.3, 2.2),
      topCentre: fmt(topD(sim, cx, cz, 3, -0.5)) };
  }
  if (c.kind === 'pillar') {
    const cz = c.c + 0.5;
    const width = (y) => { const st = 0.004; let lo = null, hi = null; for (let x = c.c - 0.6; x <= c.c + 1.6; x += st) { if (sampleGrid(sim, sim.D, x, y, cz) > 0) { if (lo === null) lo = x; hi = x; } } return lo === null ? 0 : fmt(hi - lo); };
    const vol = (() => { let n = 0; const { NX, NY, NZ, n: ns, ox, oy, oz, label } = sim; for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const y = oy + (j + 0.5) / ns; if (y > 1.25 && label[(k * NY + j) * NX + i]) n++; } return +(n / sim.cellVol).toFixed(3); })();
    return { width15: width(1.5), width25: width(2.5), width35: width(3.5), top: fmt(topD(sim, c.c + 0.5, cz, 4.8, 0.5)), volAbove125: vol };
  }
  if (c.kind === 'pit' || c.kind === 'bump') {
    const cz = (c.cz ?? c.c) + 0.5, cx = c.c + 0.5;
    const xs = range(c.c - 1.5, c.c + 2.5, 0.04);
    return { prof: xs.map((x) => fmt(topD(sim, x, cz, 3.5, -0.5))), profX: xs, profLab: xs.map((x) => fmt(topLabel(sim, x, cz))),
      centre: fmt(topD(sim, cx, cz, 3.5, -0.5)), centreLab: fmt(topLabel(sim, cx, cz)) };
  }
  // lam
  return {};
}

mkdirSync(new URL('./res/t2', import.meta.url), { recursive: true });
const outPath = new URL(`./res/t2/${group}-${regName}${nArg ? '-n' + nArg : ''}.json`, import.meta.url);
const res = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { regName, group, n: N_SUB, runs: {} };
const only = process.argv[5] ? process.argv[5].split(',') : null;
for (const c of configs[group]) {
  if (only && !only.includes(c.name)) continue;
  const sim = runSim(c.blocks, regName, { n: N_SUB });
  const info = simInfo(sim);
  const m = measure(sim, c);
  finishLocal(sim, sim.opts);
  const m0 = measure(sim, c);
  res.runs[c.name] = { ...c, blocks: undefined, nBlocks: c.blocks.length, info, m, m0 };
  console.log(`${c.name}: ${sim.ms} ms ${sim.steps} st${sim.converged ? '' : ' NC'} | ${info.phases.map((p) => `${p.mat}:${p.blocks}->${p.volume} lam ${p.lamRun}`).join(' | ')}`);
  writeFileSync(outPath, JSON.stringify(res));
}
