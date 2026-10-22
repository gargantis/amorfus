// v-table: independent re-count of terrain surface-corner classes (claim 1)
// on other seeds and regions. Own canonicalisation (not team table's code).
//   node src/freq2.mjs <label> <seedA,seedB> <cx0:cx1:step> <cz0:cz1:step> [cy0:cy1]
// A corner's 8 blocks, bit b = ox | oz<<1 | oy<<2. Class = orbit of the
// restricted-growth labelling (air fixed 0, materials renamed in order of
// first appearance) under the 48 cube symmetries.
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateRegion } from './repo.mjs';

const [label, seedS, cxS, czS, cyS = '-2:4'] = process.argv.slice(2);
const seed = seedS.split(',').map(Number);
const rng = (s) => { const [a, b, c = 1] = s.split(':').map(Number); const o = []; for (let v = a; v <= b; v += c) o.push(v); return o; };
const CX = rng(cxS), CZ = rng(czS), CY = rng(cyS);

// ---- symmetries: 6 axis permutations x 8 flips, as maps on bit index ----
const SYM = [];
for (const P of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) for (let f = 0; f < 8; f++) {
  const m = new Int8Array(8);
  for (let b = 0; b < 8; b++) {
    const c = [b & 1, (b >> 2) & 1, (b >> 1) & 1]; // x y z
    const q = [0, 1, 2].map((t) => c[P[t]] ^ ((f >> t) & 1));
    m[b] = q[0] | (q[2] << 1) | (q[1] << 2);
  }
  SYM.push(m);
}
const rgStr = (lab) => { const mp = new Map(); let s = ''; for (const v of lab) { if (v === 0) { s += '0'; continue; } if (!mp.has(v)) mp.set(v, mp.size + 1); s += mp.get(v); } return s; };
const cache = new Map();
function canon(lab) {
  const k0 = rgStr(lab);
  let c = cache.get(k0);
  if (c) return c;
  let best = null;
  const img = new Array(8);
  for (const m of SYM) { for (let b = 0; b < 8; b++) img[m[b]] = lab[b]; const k = rgStr(img); if (best === null || k < best) best = k; }
  c = { key: best, ...props(best.split('').map(Number)) };
  cache.set(k0, c);
  return c;
}
// face-connected clusters of equal non-air labels inside the 2x2x2
function clusters(lab) {
  const cl = new Int8Array(8).fill(-1); let n = 0;
  for (let b = 0; b < 8; b++) {
    if (lab[b] === 0 || cl[b] >= 0) continue;
    const st = [b]; cl[b] = n;
    while (st.length) { const c = st.pop(); for (const bit of [1, 2, 4]) { const d = c ^ bit; if (cl[d] < 0 && lab[d] === lab[c]) { cl[d] = n; st.push(d); } } }
    n++;
  }
  return { cl, n };
}
// the 6 half-edges at the corner: rings of 4 blocks around each axis half
const RINGS = [];
for (let a = 0; a < 3; a++) for (let s = 0; s < 2; s++) {
  const [u, v] = [0, 1, 2].filter((t) => t !== a);
  RINGS.push([[0, 0], [1, 0], [1, 1], [0, 1]].map(([pu, pv]) => { const c = [0, 0, 0]; c[a] = s; c[u] = pu; c[v] = pv; return c[0] | (c[2] << 1) | (c[1] << 2); }));
}
function props(lab) {
  const mats = new Set(lab.filter((v) => v));
  const air = lab.includes(0);
  const { cl, n } = clusters(lab);
  let x = false, x4 = false;
  for (const r of RINGS) {
    const L = r.map((b) => lab[b]);
    let films = 0; for (let i = 0; i < 4; i++) if (L[i] !== L[(i + 1) & 3]) films++;
    if (films === 4) { x = true; if (new Set(L).size === 4) x4 = true; }
  }
  let amb = false;
  for (const m of mats) { const s = new Set(); for (let b = 0; b < 8; b++) if (lab[b] === m) s.add(cl[b]); if (s.size > 1) amb = true; }
  const over4 = n + (air ? 1 : 0) > 4;
  return { nMat: mats.size, air, x, x4, amb, over4, plateau: !x && !over4 && !amb };
}

const H = new Map(); let surf = 0, chunks = 0, solidBlocks = 0, totalBlocks = 0;
const matCount = new Map();
const lab = new Array(8);
const t0 = performance.now();
for (const cx of CX) for (const cz of CZ) for (const cy of CY) {
  const r = generateRegion(seed, cx * 32 - 1, cy * 32 - 1, cz * 32 - 1, 33, 33, 33);
  const B = r.blocks;
  chunks++;
  for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    let a = false, s = false;
    for (let b = 0; b < 8; b++) {
      const v = B[((y + ((b >> 2) & 1)) * 33 + (z + ((b >> 1) & 1))) * 33 + (x + (b & 1))] & 0xff;
      lab[b] = v; if (v) s = true; else a = true;
    }
    const v0 = B[((y + 1) * 33 + (z + 1)) * 33 + (x + 1)] & 0xff;
    totalBlocks++; if (v0) { solidBlocks++; matCount.set(v0, (matCount.get(v0) ?? 0) + 1); }
    if (!(a && s)) continue;
    surf++;
    const c = canon(lab);
    const e = H.get(c.key); if (e) e.n++; else H.set(c.key, { n: 1, p: c });
  }
}
const arr = [...H.entries()].sort((a, b) => b[1].n - a[1].n);
let acc = 0, k99 = null, k999 = null;
arr.forEach(([, e], i) => { acc += e.n; if (k99 === null && acc >= 0.99 * surf) k99 = i + 1; if (k999 === null && acc >= 0.999 * surf) k999 = i + 1; });
const sum = (f) => arr.reduce((s, [, e]) => s + (f(e.p) ? e.n : 0), 0);
const pct = (v) => +(100 * v / Math.max(1, surf)).toFixed(3);
const out = {
  label, seed, CX, CZ, CY, chunks, surface: surf, classesSeen: arr.length, classesFor99: k99, classesFor999: k999,
  singleMaterialPct: pct(sum((p) => p.nMat === 1)), byMat: Object.fromEntries([1, 2, 3, 4].map((m) => [m, pct(sum((p) => p.nMat === m))])),
  nonPlateauPct: pct(sum((p) => !p.plateau)), ambUnionPct: pct(sum((p) => p.amb)), xNoAmbPct: pct(sum((p) => p.x && !p.amb)),
  over4OnlyPct: pct(sum((p) => p.over4 && !p.x && !p.amb)), x4DistinctPct: pct(sum((p) => p.x4)),
  ambSingleMatPct: pct(sum((p) => p.amb && p.nMat === 1)), ambMultiMatPct: pct(sum((p) => p.amb && p.nMat > 1)),
  solidFrac: +(solidBlocks / totalBlocks).toFixed(4),
  blockMats: Object.fromEntries([...matCount.entries()].sort((a, b) => a[0] - b[0]).map(([m, n]) => [m, +(n / Math.max(1, solidBlocks)).toFixed(4)])),
  top: arr.slice(0, 16).map(([k, e]) => [k, pct(e.n)]),
  hist: arr.map(([k, e]) => [k, e.n]),
  secs: +((performance.now() - t0) / 1000).toFixed(1),
};
mkdirSync(new URL('../res/freq/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../res/freq/${label}.json`, import.meta.url), JSON.stringify(out));
const { hist, ...brief } = out;
console.log(JSON.stringify(brief));
