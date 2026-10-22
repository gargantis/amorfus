// Step 3a: simulate corner classes in canonical embeddings and record the
// vertex at the central corner (the table entries).
//   node src/classsim.mjs <regime> <emb> <n> <sem> <classes> [--img]
// regime: FID-0.15 | FINITE-4
// emb: E<ext><c|m>: each octant block extruded to ext^3 (E1: the 8 blocks;
//      E2: a 4^3 box; E3: a 6^3 box).
//      'c' = clamped: the grid is exactly the box (margin 0) and the engine
//            copy src/mbo-clamp.mjs continues each octant past the box edge
//            (clamp blur), so the octants act as infinite and only the
//            central corner is curved ("corner inside huge bubbles").
//      'm' = isolated: the box's solid blocks with 1 block of air margin
//            (identical to lib/mbo.mjs, an object of that size in air).
// sem: clu (engine default: face-connected clusters) | mat (every block of
//      one material is one bubble from the start)
// classes: comma list of class ids | 'top:<k>' | 'range:a-b' | 'all' — order
//      from res/classlist.json (seen in terrain/builds by frequency, then
//      catalogue-only classes)
// --novol: run without the per-bubble volume constraint (diagnostic).
// Writes res/table/<regime>_<emb>_n<n>_<sem>[-novol].json (merged by class id).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { simulateScene, measureCorner, REGIMES } from './sim.mjs';
import { applySym } from './lattice.mjs';
import { renderView, savePng } from '../../../lib/render.mjs';

export const MATS = [0, 6, 7, 1, 4, 2, 3, 5]; // canonical label -> material (A B C D, then dirt stone planks)

export function embed(rep, ext) {
  const blocks = [];
  rep.forEach((L, b) => {
    if (!L) return;
    const c = [b & 1, (b >> 2) & 1, (b >> 1) & 1];
    const r = c.map((v) => (v ? [0, ext - 1] : [-ext, -1]));
    for (let y = r[1][0]; y <= r[1][1]; y++) for (let z = r[2][0]; z <= r[2][1]; z++) for (let x = r[0][0]; x <= r[0][1]; x++) blocks.push([x, y, z, MATS[L]]);
  });
  return blocks;
}

export function embOpts(emb) {
  const ext = +emb[1], kind = emb[2];
  return kind === 'c'
    ? { ext, opts: { margin: 0, bbox: [-ext, -ext, -ext, ext - 1, ext - 1, ext - 1] } }
    : { ext, opts: { margin: 1 } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [regName, emb, nStr, sem, which, ...flags] = process.argv.slice(2);
  const n = +nStr;
  const ROOT = new URL('..', import.meta.url).pathname;
  const CL = JSON.parse(readFileSync(ROOT + 'res/classes.json', 'utf8')).classes;
  const LIST = JSON.parse(readFileSync(ROOT + 'res/classlist.json', 'utf8')).order;
  let ids;
  if (which.startsWith('top:')) ids = LIST.slice(0, +which.slice(4));
  else if (which === 'all') ids = LIST;
  else if (which === 'allsurf') ids = [...LIST, ...CL.filter((c) => c.hasAir && c.nMat > 0 && !LIST.includes(c.id)).map((c) => c.id)]; // every surface class
  else if (which.startsWith('range:')) { const [a, b] = which.slice(6).split('-').map(Number); ids = LIST.slice(a, b); }
  else ids = which.split(',').map(Number);
  const { ext, opts: eo } = embOpts(emb);
  const outDir = ROOT + 'res/table';
  mkdirSync(outDir, { recursive: true });
  const novol = flags.includes('--novol'); // diagnostic: no per-bubble volume constraint
  const outPath = `${outDir}/${regName}_${emb}_n${n}_${sem}${novol ? '-novol' : ''}.json`;
  const res = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { regime: regName, emb, n, sem, entries: {} };
  const t00 = performance.now();
  for (const id of ids) {
    const c = CL[id];
    if (!c.hasAir || c.nMat === 0) continue;
    if (sem === 'mat' && !c.ambUnion) continue; // identical to clu
    if (res.entries[id] && !flags.includes('--redo') && !flags.includes('--img')) continue;
    const rep = c.key.split('').map(Number);
    const blocks = embed(rep, ext);
    const t0 = performance.now();
    const sim = simulateScene(blocks, { ...REGIMES[regName], n, ...eo, ...(novol ? { volume: false } : {}) }, sem === 'mat' ? () => 'all' : null);
    const lab8 = rep.map((L) => MATS[L]);
    const m = measureCorner(sim, [0, 0, 0], lab8);
    const ms = Math.round(performance.now() - t0);
    const r3 = (v) => (v ? v.map((x) => +x.toFixed(4)) : null);
    res.entries[id] = {
      key: c.key, ms, steps: sim.steps, converged: !!sim.converged, changes: sim.history.reduce((a, b) => a + b, 0),
      phases0: sim.phases.length - 1, alive: sim.phases.filter((P, p) => p && P.alive).length, premerged: sim.premerged ?? 0,
      lambda: sim.phases.filter((P, p) => p && P.alive).map((P) => +P.lambda.toFixed(4)),
      nCross: m.nCross, projOk: m.projOk, vraw: r3(m.vraw), vsn: r3(m.vsn), vseam: r3(m.vseam), seamInCell: m.seamInCell ?? 0,
      vmat: m.vmat ? Object.fromEntries(Object.entries(m.vmat).map(([k, v]) => [k, r3(v)])) : null,
    };
    const e = res.entries[id];
    console.log(`${id} ${c.key} ${regName} ${emb} n${n} ${sem}: ${ms} ms, ${sim.steps} steps, ${e.changes} label changes, alive ${e.alive}/${e.phases0}, vsn ${JSON.stringify(e.vsn)} vseam ${JSON.stringify(e.vseam)}`);
    if (flags.includes('--img')) {
      const imgDir = ROOT + 'img/classes';
      mkdirSync(imgDir, { recursive: true });
      const tag = `c${id}-${regName}-${emb}-n${n}-${sem}`;
      // for the picture only: re-simulate the class turned (one of the 48
      // symmetries) so that its air side faces up toward the sun, and frame
      // the corner; the table entry above is from the canonical orientation
      const airDir = (lab) => { const air = [0, 0, 0], sol = [0, 0, 0]; let na = 0, ns = 0;
        lab.forEach((L, b) => { const cc = [b & 1, (b >> 2) & 1, (b >> 1) & 1]; for (let t = 0; t < 3; t++) (L ? sol : air)[t] += cc[t]; if (L) ns++; else na++; });
        return [0, 1, 2].map((t) => air[t] / na - sol[t] / ns); };
      let bestG = 0, bestS = -Infinity;
      for (let gg = 0; gg < 48; gg++) { const d = airDir(applySym(gg, rep)); const sc = 0.45 * d[0] + 0.8 * d[1] + 0.6 * d[2]; if (sc > bestS + 1e-9) { bestS = sc; bestG = gg; } }
      const repImg = applySym(bestG, rep);
      const simImg = bestG === 0 ? sim : simulateScene(embed(repImg, ext), { ...REGIMES[regName], n, ...eo, ...(novol ? { volume: false } : {}) }, sem === 'mat' ? () => 'all' : null);
      const vo = emb[2] === 'c'
        ? { width: 240, height: 200, ao: false, target: [0, 0, 0], bounds: { min: [-1.2, -1.2, -1.2], max: [1.2, 1.2, 1.2] } }
        : { width: 240, height: 200, ao: false, bounds: { min: [-ext, -ext, -ext], max: [ext, ext, ext] } };
      savePng(`${imgDir}/${tag}.png`, renderView(simImg, vo));
    }
    writeFileSync(outPath, JSON.stringify(res));
  }
  console.log(`done ${ids.length} classes in ${((performance.now() - t00) / 1000).toFixed(1)} s -> ${outPath}`);
}
