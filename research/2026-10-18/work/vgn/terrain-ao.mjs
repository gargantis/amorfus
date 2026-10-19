// vgn: AO purpose on REAL generated terrain. 48 chunks from seeds [1,1] and
// [7,7] (caves, overhangs, cliffs, ordinary surface), production apron 3.
// Vertex order is identical between production and gn-best (positions are
// byte-identical), so AO is compared per vertex. Each vertex is classed by
// its sky cover: open, overhang (solid ≤ 4 blocks above), cave (deeper).
//   node work/vgn/terrain-ao.mjs [--json out.json]
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const survey = JSON.parse(readFileSync(new URL('./survey.json', import.meta.url)));
const key = (r) => `${r.seed}|${r.c}`;
const pick = new Map();
const add = (arr, n) => { for (const r of arr.slice(0, n)) pick.set(key(r), r); };
const by = (f) => survey.slice().sort((a, b) => f(b) - f(a));
for (const s of ['1,1', '7,7']) {
  const S = survey.filter((r) => String(r.seed) === s);
  add(S.slice().sort((a, b) => b.cave - a.cave), 8);
  add(S.slice().sort((a, b) => b.over - a.over), 5);
  add(S.slice().sort((a, b) => b.hRange * 10000 + b.surf - (a.hRange * 10000 + a.surf)), 5);
  add(S.filter((r) => r.cave < 200).sort((a, b) => b.surf - a.surf), 6); // open surface
}
const chunks = [...pick.values()];
// column tops for sky cover
const topCache = new Map();
function columnTops(seed, cx, cz) {
  const k = `${seed}|${cx},${cz}`;
  if (topCache.has(k)) return topCache.get(k);
  const tops = new Int32Array(34 * 34).fill(-1e9); // world x cx*32-1 .. cx*32+32
  for (let cy = 4; cy >= -2; cy--) {
    // region apron 1 to cover the corner's 4 columns
    const inp = buildGenMeshInput(seed, cx, cy, cz, new Map(), { forceApron: 1 }).input;
    const n = inp.nx;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      if (tops[z * 34 + x] > -1e9) continue;
      for (let y = n - 1; y >= 1; y--) { // y 0 is the apron below; skip
        if ((inp.blocks[(y * n + z) * n + x] & 0xff) !== 0) { tops[z * 34 + x] = cy * 32 + y - 1; break; }
      }
    }
  }
  topCache.set(k, tops);
  return tops;
}
const classes = ['open', 'overhang', 'cave'];
const acc = Object.fromEntries(classes.map((c) => [c, { n: 0, prod: 0, gn: 0, lighter15: 0, lighter30: 0, darker15: 0, prodDark: 0, gnDark: 0, prodDarkGnLight: 0, roughP: 0, roughG: 0, rn: 0, maxJumpP: 0, maxJumpG: 0 }]));
const worst = [];
const perChunk = [];
for (const r of chunks) {
  const [cx, cy, cz] = r.c;
  const inp = buildGenMeshInput(r.seed, cx, cy, cz, new Map(), { forceApron: 3 }).input;
  const P = core.decodeMesh(repoMesh({ ...inp, params: {} }));
  const G = core.decodeMesh(gnMesh({ ...inp, params: PARAMS }));
  if (P.V !== G.V) throw new Error('vertex count differs');
  const tops = columnTops(r.seed, cx, cz);
  const corner = gnMesh({ ...inp, params: {} }).corners; // chunk-local lattice corners
  const cls = new Uint8Array(P.V);
  for (let v = 0; v < P.V; v++) {
    const lx = corner[v * 3], ly = corner[v * 3 + 1], lz = corner[v * 3 + 2];
    // the 4 columns around the corner: blocks lx-1..lx, lz-1..lz → tops index (x+1)
    let cover = -1e9;
    const wy = cy * 32 + ly; // corner y (world); blocks above start at wy
    let minAbove = Infinity;
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const t = tops[(lz - 1 + oz + 1) * 34 + (lx - 1 + ox + 1)];
      if (t >= wy) minAbove = Math.min(minAbove, t - wy + 1); // solid somewhere at or above
    }
    // covered when the column top is above the corner by more than the
    // corner's own block, i.e. the vertex is not the top surface
    let c = 0;
    // test: is there solid strictly above the corner's upper blocks with air between? use top − wy
    const top = Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([ox, oz]) => tops[(lz - 1 + oz + 1) * 34 + (lx - 1 + ox + 1)]));
    const minTop = Math.min(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([ox, oz]) => tops[(lz - 1 + oz + 1) * 34 + (lx - 1 + ox + 1)]));
    // corner is the terrain surface if wy is within [minTop, top+1]
    if (wy > top) c = 0; // above all columns: open
    else if (wy >= minTop) c = 0; // on a step of the terrain top
    else c = (minTop - wy) <= 4 ? 1 : 2;
    cls[v] = c;
  }
  // neighbours from triangle edges, per lattice corner (merge material copies)
  const nb = Array.from({ length: P.V }, () => new Set());
  for (let t = 0; t < P.T; t++) {
    const a = P.tri[t * 3], b = P.tri[t * 3 + 1], c = P.tri[t * 3 + 2];
    nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
  }
  const chunkStat = { seed: r.seed, c: r.c, V: P.V, cave: 0, caveP: 0, caveG: 0 };
  for (let v = 0; v < P.V; v++) {
    if (P.flags[v] & 1) continue;
    const a = acc[classes[cls[v]]];
    a.n++;
    a.prod += P.ao[v];
    a.gn += G.ao[v];
    const d = G.ao[v] - P.ao[v];
    if (d > 0.15) a.lighter15++;
    if (d > 0.30) a.lighter30++;
    if (d < -0.15) a.darker15++;
    if (P.ao[v] < 0.8) a.prodDark++;
    if (G.ao[v] < 0.8) a.gnDark++;
    if (P.ao[v] < 0.75 && G.ao[v] > 0.95) a.prodDarkGnLight++;
    if (cls[v] === 2) { chunkStat.cave++; chunkStat.caveP += P.ao[v]; chunkStat.caveG += G.ao[v]; }
    let mp = 0, mg = 0, k = 0;
    for (const w of nb[v]) { mp += P.ao[w]; mg += G.ao[w]; k++; const jp = Math.abs(P.ao[w] - P.ao[v]), jg = Math.abs(G.ao[w] - G.ao[v]); if (jp > a.maxJumpP) a.maxJumpP = jp; if (jg > a.maxJumpG) a.maxJumpG = jg; }
    if (k) { a.roughP += (P.ao[v] - mp / k) ** 2; a.roughG += (G.ao[v] - mg / k) ** 2; a.rn++; }
    if (d > 0.25 || d < -0.25) worst.push({ seed: r.seed, c: r.c, p: [P.pos[v * 3], P.pos[v * 3 + 1], P.pos[v * 3 + 2]].map((x) => +x.toFixed(2)), prod: +P.ao[v].toFixed(2), gn: +G.ao[v].toFixed(2), cls: classes[cls[v]] });
  }
  perChunk.push(chunkStat);
}
console.log(`${chunks.length} chunks (${chunks.filter((r) => String(r.seed) === '1,1').length} seed [1,1], ${chunks.filter((r) => String(r.seed) === '7,7').length} seed [7,7]), apron 3`);
for (const c of classes) {
  const a = acc[c];
  const f = (x) => (100 * x / a.n).toFixed(2) + '%';
  console.log(`${c.padEnd(9)} n=${a.n}  mean AO prod ${(a.prod / a.n).toFixed(3)} gn ${(a.gn / a.n).toFixed(3)} | AO<0.8: prod ${f(a.prodDark)} gn ${f(a.gnDark)} | gn lighter >0.15 ${f(a.lighter15)} >0.30 ${f(a.lighter30)}, darker >0.15 ${f(a.darker15)} | prod<0.75→gn>0.95 ${a.prodDarkGnLight} | roughness rms prod ${Math.sqrt(a.roughP / a.rn).toFixed(4)} gn ${Math.sqrt(a.roughG / a.rn).toFixed(4)} | max edge jump prod ${a.maxJumpP.toFixed(2)} gn ${a.maxJumpG.toFixed(2)}`);
}
worst.sort((a, b) => Math.abs(b.gn - b.prod) - Math.abs(a.gn - a.prod));
console.log('largest per-vertex AO changes (gn − prod):');
for (const w of worst.slice(0, 15)) console.log(' ', JSON.stringify(w));
const cave = perChunk.filter((s) => s.cave > 200).map((s) => `${s.seed}@${s.c}: ${s.cave} cave verts, mean AO prod ${(s.caveP / s.cave).toFixed(3)} gn ${(s.caveG / s.cave).toFixed(3)}`);
console.log('cave chunks:\n  ' + cave.join('\n  '));
const ji = process.argv.indexOf('--json');
if (ji > 0) writeFileSync(process.argv[ji + 1], JSON.stringify({ chunks: chunks.map((r) => ({ seed: r.seed, c: r.c })), acc, worst: worst.slice(0, 200), perChunk }, null, 1));
