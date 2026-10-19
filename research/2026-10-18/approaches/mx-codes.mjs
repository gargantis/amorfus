// mx-codes: production-path contour codes (work/mx/prod.mjs; WGSL in
// work/mx/gpu/mx.wgsl, validated equal to this emulation).
//  mesh() = hints mesh + every (surface block, direction) code a fragment of
//   this chunk can need, computed here (honest CPU cost):
//   - per direction, a block is coded if a surface-followed in-plane
//     neighbour has another material; cracks are fitted ONCE each in a 15×15
//     surface-followed window (axis ±2) centred on their owner block (low
//     side), falling back to the high cell's window when the two disagree —
//     canonical, so neighbouring blocks and chunks agree bit for bit;
//   - fit: TLS line over the digital-straight run window (≥ 9 cracks),
//     blended over 4 cracks into a weighted parabola over ±6 cracks;
//     crossings slide along their dual edge only, |τ| ≤ 0.45;
//   - topology: xBR saddle weights (connect on margin ≥ 2 with weight ≥ 3,
//     else follow weaker evidence unless part of an extended checker of
//     ≥ 12 saddle points), corners kept where two runs ≥ 3 meet, one-cell
//     chains stay square, lone blocks → inscribed disc;
//   - ≤ 2 passages per (block, direction) packed in 64 bits.
//  GPU data: r32uint texel volume 38³ per chunk (material, sharp, exposure,
//   has-code mask, code base) + array<vec2u> codes (≈ 180 per chunk).
//  fragment(): projection axis = y while |n_y| ≥ 0.5·max(|n_x|, |n_z|) (≈ 63°),
//   else the dominant horizontal axis; column search within ±2 levels (1–3
//   texel loads), one 8-byte code load when coded, ≤ 2 two-segment polyline
//   side tests. Apron 10 (verified: 9 already mismatches).
import { prep, computeCodes, buildTexels, fragmentGpu, skipBits, DEFAULTS } from '../work/mx/prod.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'mx-codes';
export const describe = 'Contour codes per surface block computed in mesh(): each crack fitted once in a 15×15 surface-followed window centred on its owner (TLS over digital-straight runs ≥ 9 cracks blended into a parabola ±6; |τ| ≤ 0.45), xBR saddles with margin + checker groups, corners kept, lone blocks → discs; ≤ 2 passages in 64 bits; GPU: 38³ r32uint texels + code buffer; fragment: y-biased projection axis, column search + 1 code load; hints geometry; apron 10.';
export const apron = 10;
export const OPTS = { ...DEFAULTS, loneRound: process.env.MX_LONE !== 'square', ...(process.env.MX_OPTS ? JSON.parse(process.env.MX_OPTS) : {}) };

let CUR = null;
const DEBUG = process.env.MX_DEBUG ?? '';
const YBIAS = Number(process.env.MX_YBIAS ?? 0.5);
const FW = Number(process.env.MX_FW ?? 2);
const SKIP = process.env.MX_SKIP !== '0';
const LOG = [];
const WORK = join(dirname(fileURLToPath(import.meta.url)), '..', 'work', 'mx');
const flush = () => {
  if (!CUR) return;
  const s = CUR.st;
  LOG.push({ label: CUR.label, codes: CUR.stats.coded, surface: CUR.stats.surface, passes: CUR.stats.passes, overflow: CUR.stats.overflow, crackFits: CUR.stats.crackFits, crackMiss: CUR.stats.crackMiss, tauFallback: CUR.stats.tauFallback, ownerWindows: CUR.stats.ownerWindows, windows: CUR.stats.windows, codeMs: +CUR.codeMs.toFixed(2), texelBytes: CUR.G.tex.byteLength, codeBytes: CUR.G.codeWords.byteLength, frags: s.frags, fetchMean: s.frags ? +(s.fetch / s.frags).toFixed(3) : 0, codedFrac: s.frags ? +(s.code / s.frags).toFixed(3) : 0, noSurface: s.noSurface, sharp: s.sharp, oob: s.oob, skipFrac: s.frags ? +(s.skip / s.frags).toFixed(3) : 0, fetchHist: s.hist });
};
// Writes work/mx/stats/<name>-<tool>.json on exit. Opt-in (MX_STATS=1) since
// recording, so reproducing a result never overwrites the recorded stats.
if (process.env.MX_STATS) process.on('exit', () => {
  flush();
  try {
    mkdirSync(join(WORK, 'stats'), { recursive: true });
    const tool = process.argv[1].split('/').pop().replace('.mjs', '');
    writeFileSync(join(WORK, 'stats', `${name}-${tool}.json`), JSON.stringify(LOG, null, 1));
  } catch { /* ignore */ }
});
let nMesh = 0;
export function mesh(region, scene, core) {
  flush();
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  const t0 = performance.now();
  const P = prep(region);
  const { codes, stats } = computeCodes(P, OPTS);
  const G = buildTexels(P, codes, 3);
  const codeMs = performance.now() - t0;
  if (process.env.MX_SEAMDIGEST && m.corner) {
    // TEST ONLY (not a production attribute): per-vertex digest of the codes of
    // the 8 blocks around the vertex's lattice corner, all 6 directions, so
    // harness/seams.mjs compares the codes near the shared plane too.
    const byBlock = new Map();
    for (let c = 0; c < codes.length; c += 6) {
      const k = `${codes[c]},${codes[c + 1]},${codes[c + 2]}`;
      let h = byBlock.get(k) ?? 0x811c9dc5;
      h = Math.imul(h ^ codes[c + 3], 16777619); h = Math.imul(h ^ codes[c + 4], 16777619); h = Math.imul(h ^ codes[c + 5], 16777619);
      byBlock.set(k, h >>> 0);
    }
    m.attrDim = 4;
    m.attrs = new Float64Array(m.V * 4);
    for (let v = 0; v < m.V; v++) {
      for (let k = 0; k < 3; k++) m.attrs[v * 4 + k] = m.nrm[v * 3 + k];
      const cx = m.corner[v * 3], cy = m.corner[v * 3 + 1], cz = m.corner[v * 3 + 2];
      let h = 0;
      for (let dy = -1; dy <= 0; dy++) for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
        const b = byBlock.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (b !== undefined) h = (Math.imul(h ^ b, 16777619) >>> 0);
      }
      m.attrs[v * 4 + 3] = h >>> 8;
    }
  } else {
    // attrs = smooth normal + the per-vertex skip bit (flags bit 2 in the real
    // vertex; interpolated, a fragment skips the lookup when it is 1)
    const { bits } = SKIP ? skipBits(G, m, YBIAS, FW) : { bits: new Uint8Array(m.V) };
    m.attrDim = 4;
    m.attrs = new Float64Array(m.V * 4);
    for (let v = 0; v < m.V; v++) { m.attrs[v * 4] = m.nrm[v * 3]; m.attrs[v * 4 + 1] = m.nrm[v * 3 + 1]; m.attrs[v * 4 + 2] = m.nrm[v * 3 + 2]; m.attrs[v * 4 + 3] = bits[v]; }
  }
  m.mx = { texelBytes: G.tex.byteLength, codeBytes: G.codeWords.byteLength, codes: codes.length / 6 };
  CUR = { G, stats, codeMs, flags: m.flags, attrDim: m.attrDim, label: scene?.name ?? `bench-${nMesh}`, st: { frags: 0, fetch: 0, code: 0, noSurface: 0, sharp: 0, oob: 0, skip: 0, hist: [0, 0, 0, 0, 0, 0, 0] } };
  nMesh++;
  return m;
}
export function fragment(attrs, info) {
  const st = CUR.st;
  st.frags++;
  if (CUR.flags[info.a] & 1) { st.sharp++; return info.ownMat; }
  if (CUR.attrDim === 4 && attrs[3] > 0.9999) { st.skip++; st.hist[0]++; return info.ownMat; }
  const f0 = st.fetch;
  const r = fragmentGpu(CUR.G, attrs, info.x, info.y, info.z, FW, st, YBIAS);
  st.hist[Math.min(6, st.fetch - f0)]++;
  if (r < 0 && DEBUG === 'nosurf') return 7;
  return r < 0 ? info.ownMat : r;
}
