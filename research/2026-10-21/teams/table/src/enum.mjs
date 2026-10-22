// Step 1: enumerate the 2x2x2 neighbourhoods of a lattice corner, count
// classes up to the 48 cube symmetries and material relabelling (air fixed),
// by number of materials; once with materials as the unit and once with
// clusters; classify junctions; verify every count two ways.
//   node src/enum.mjs > logs/enum.log      (writes res/classes.json)
import { writeFileSync } from 'node:fs';
import { SYMS, applySym, allRG, rgKey, canon, clusterLabels, classify, buildClassTable } from './lattice.mjs';

const OUT = new URL('../res/classes.json', import.meta.url);
const log = (...a) => console.log(...a);

// ---------- solid/air only (256 masks) ----------
const maskImg = (g, m) => { let t = 0; for (let b = 0; b < 8; b++) if ((m >> b) & 1) t |= 1 << SYMS[g].map[b]; return t; };
const maskCanon = new Map();
for (let m = 0; m < 256; m++) { let best = 256; for (let g = 0; g < 48; g++) best = Math.min(best, maskImg(g, m)); maskCanon.set(m, best); }
const binClassesBrute = new Set(maskCanon.values()).size;
// Burnside / Polya: (1/48) sum_g 2^cycles(g)
const cycles = (map) => { const seen = new Array(8).fill(false); const out = []; for (let b = 0; b < 8; b++) { if (seen[b]) continue; let L = 0, c = b; while (!seen[c]) { seen[c] = true; c = map[c]; L++; } out.push(L); } return out; };
let binFix = 0;
for (const s of SYMS) binFix += 2 ** cycles(s.map).length;
log(`solid/air masks: 256 -> classes brute ${binClassesBrute}, Burnside ${binFix / 48}`);

// ---------- material view: brute force ----------
const T = buildClassTable();
const all = allRG(8);
log(`labellings up to relabelling (RG strings): ${all.length} (Bell(9) = 21147)`);
log(`material-view classes (brute force, canonical min over 48 syms): ${T.classes.length}`);

// ---------- material view: de Bruijn power-group Burnside ----------
function partitions(n, max = n) { if (n === 0) return [[]]; const out = []; for (let k = Math.min(n, max); k >= 1; k--) for (const p of partitions(n - k, k)) out.push([k, ...p]); return out; }
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
function classSize(lambda) { const m = lambda.reduce((a, b) => a + b, 0); const cnt = {}; for (const k of lambda) cnt[k] = (cnt[k] ?? 0) + 1; let d = 1; for (const [k, a] of Object.entries(cnt)) d *= (+k) ** a * fact(a); return fact(m) / d; }
const symCycles = SYMS.map((s) => cycles(s.map));
function deBruijn(m, withAir) {
  if (m === 0) return withAir ? 1 : 0;
  let tot = 0;
  for (const lam of partitions(m)) {
    const cs = classSize(lam);
    for (const cyc of symCycles) {
      let prod = 1;
      for (const L of cyc) { let f = withAir ? 1 : 0; for (const k of lam) if (L % k === 0) f += k; prod *= f; }
      tot += cs * prod;
    }
  }
  return tot / (48 * fact(m));
}
const N = [], Nno = [];
for (let m = 0; m <= 8; m++) { N.push(deBruijn(m, true)); Nno.push(deBruijn(m, false)); }
log(`de Bruijn N(<=m materials, air allowed): ${N.join(' ')}`);
log(`de Bruijn N(<=m materials, no air):      ${Nno.join(' ')}`);

// ---------- per-class classification ----------
const byMat = {}, byMatBurn = {};
for (let k = 0; k <= 8; k++) byMatBurn[k] = k === 0 ? 1 : N[k] - N[k - 1];
const classes = T.classes.map((c, id) => ({ id, key: c.key, size: c.size, ...classify(c.rep) }));
for (const c of classes) byMat[c.nMat] = (byMat[c.nMat] ?? 0) + 1;
log(`classes by #materials (brute):    ${JSON.stringify(byMat)}`);
log(`classes by #materials (Burnside): ${JSON.stringify(byMatBurn)}`);
const noAirBrute = classes.filter((c) => !c.hasAir).length;
log(`classes with no air: brute ${noAirBrute}, de Bruijn ${Nno[8]}`);
const surf = classes.filter((c) => c.hasAir && c.nMat > 0);
log(`mesher surface classes (air + solid): brute ${surf.length}, de Bruijn ${N[8] - Nno[8] - 1}`);
log(`'not all the same' classes: ${classes.filter((c) => !(c.nMat === 0 || (c.nMat === 1 && !c.hasAir))).length}`);
log(`seam classes (air + >=2 materials): ${surf.filter((c) => c.nMat >= 2).length}`);

// ---------- cluster view ----------
// structure = (air set, partition of the solid blocks into face-connected
// clusters). Every labelling maps to one; distinct structures:
const cluKey = (lab) => rgKey(clusterLabels(lab));
const cluStructs = new Map();
for (const lab of all) { const k = cluKey(lab); if (!cluStructs.has(k)) cluStructs.set(k, k.split('').map(Number)); }
log(`cluster structures (air set + connected partition): ${cluStructs.size}`);
// brute force classes
const cluCanon = new Map();
for (const [k, lab] of cluStructs) cluCanon.set(k, canon(lab).key);
const cluClasses = new Set(cluCanon.values());
// Burnside with an independent invariance test: partition as a set of sets
const asSets = (lab) => { const m = new Map(); lab.forEach((v, b) => { if (!m.has(v)) m.set(v, []); m.get(v).push(b); }); return new Set([...m.entries()].map(([v, bs]) => (v === 0 ? 'air:' : 's:') + bs.sort().join(','))); };
const eqSets = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
let cluFix = 0;
for (let g = 0; g < 48; g++) for (const lab of cluStructs.values()) if (eqSets(asSets(lab), asSets(applySym(g, lab)))) cluFix++;
log(`cluster-view classes: brute ${cluClasses.size}, Burnside ${cluFix / 48}`);
// by number of clusters, both ways
const byClu = {}, byCluB = {};
for (const k of cluClasses) { const n = Math.max(0, ...k.split('').map(Number)); byClu[n] = (byClu[n] ?? 0) + 1; }
for (let g = 0; g < 48; g++) for (const lab of cluStructs.values()) { if (!eqSets(asSets(lab), asSets(applySym(g, lab)))) continue; const n = Math.max(0, ...lab); byCluB[n] = (byCluB[n] ?? 0) + 1 / 48; }
for (const k in byCluB) byCluB[k] = +byCluB[k].toFixed(6);
log(`cluster-view classes by #clusters (brute):    ${JSON.stringify(byClu)}`);
log(`cluster-view classes by #clusters (Burnside): ${JSON.stringify(byCluB)}`);
// Burnside check of the material view by fixed points too
let matFix = 0;
for (let g = 0; g < 48; g++) for (const lab of all) if (eqSets(asSets(lab), asSets(applySym(g, lab)))) matFix++;
log(`material-view classes: Burnside fixed points (set-of-sets test) ${matFix / 48}`);

// ---------- junction classification summary ----------
function summary(list, name) {
  const s = {
    classes: list.length,
    xEdge: list.filter((c) => c.xEdges > 0).length,
    x4Distinct: list.filter((c) => c.x4Distinct > 0).length,
    xAmbigOnly: list.filter((c) => c.xEdges > 0 && c.x4Distinct === 0).length,
    over4Mat: list.filter((c) => c.over4Mat).length,
    over4Clu: list.filter((c) => c.over4Clu).length,
    ambUnion: list.filter((c) => c.ambUnion).length,
    ambEdge: list.filter((c) => c.ambEdge).length,
    ambVertexOnly: list.filter((c) => c.ambVertex && !c.ambEdge).length,
    airSplit: list.filter((c) => c.airSplit).length,
    nonPlateau: list.filter((c) => !c.plateau).length,
    plateau: list.filter((c) => c.plateau).length,
  };
  log(`${name}: ${JSON.stringify(s)}`);
  return s;
}
const sums = {
  all: summary(classes, 'all classes'),
  surface: summary(surf, 'surface (air+solid)'),
};
for (let k = 1; k <= 8; k++) sums[`surf${k}mat`] = summary(surf.filter((c) => c.nMat === k), `surface, ${k} materials`);
// cluster-view classes classified (a cluster structure is a labelling whose labels are clusters)
const cluList = [...cluClasses].map((k) => classify(k.split('').map(Number)));
sums.cluAll = summary(cluList, 'cluster-view classes');
sums.cluSurface = summary(cluList.filter((c) => c.hasAir && c.nMat > 0), 'cluster-view surface classes');

writeFileSync(OUT, JSON.stringify({
  note: 'position b = ox | oz<<1 | oy<<2; key = canonical RG string (air 0) over positions 0..7',
  counts: {
    binaryClasses: { brute: binClassesBrute, burnside: binFix / 48 },
    labellings: all.length,
    materialClasses: { brute: T.classes.length, deBruijn: N[8], burnsideFixedPoints: matFix / 48 },
    byMaterials: { brute: byMat, deBruijn: byMatBurn },
    noAir: { brute: noAirBrute, deBruijn: Nno[8] },
    surface: { brute: surf.length, deBruijn: N[8] - Nno[8] - 1 },
    clusterStructures: cluStructs.size,
    clusterClasses: { brute: cluClasses.size, burnside: cluFix / 48 },
    byClusters: { brute: byClu, burnside: byCluB },
  },
  summaries: sums,
  classes,
}, null, 0));
log('wrote res/classes.json');
