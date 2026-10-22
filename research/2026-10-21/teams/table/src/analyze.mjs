// Step 4: error statistics of every vertex rule on every scene set, context
// dependence, data-driven tables with larger keys, reproducibility and
// resolution floors.  node src/analyze.mjs > logs/analyze.log
// (writes res/analysis.json)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { SYMS, symPoint, symPointInv, buildClassTable, classOf } from './lattice.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const CL = JSON.parse(readFileSync(ROOT + 'res/classes.json', 'utf8')).classes;
const out = {};
const log = (...a) => console.log(...a);
const stats = (arr) => {
  const a = arr.filter((x) => x !== null && Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const q = (f) => a[Math.min(a.length - 1, Math.floor(f * a.length))];
  return { n: a.length, mean: +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(4), p50: +q(0.5).toFixed(4), p90: +q(0.9).toFixed(4), p99: +q(0.99).toFixed(4), max: +a[a.length - 1].toFixed(4) };
};
const fmt = (s) => (s ? `mean ${s.mean.toFixed(3)} p50 ${s.p50.toFixed(3)} p90 ${s.p90.toFixed(3)} p99 ${s.p99.toFixed(3)} max ${s.max.toFixed(3)} (n ${s.n})` : '-');
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function load(set, reg, n = 12) {
  const p = `${ROOT}res/scenes/${set}_${reg}_n${n}.json`;
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
const isTwin = (name) => name.endsWith('-shift');

// ---------- A: rule errors per set ----------
out.rules = {};
for (const reg of ['FID-0.15', 'FINITE-4']) {
  for (const [set, file, pick] of [['cat', 'cat', () => true], ['terrain-random', 'terrain', (nm) => /^t\d+[ab]$/.test(nm)],
    ['terrain-seam', 'terrain', (nm) => /^t\d+s$/.test(nm)], ['builds', 'builds', () => true]]) {
    const S = load(file, reg);
    if (!S) continue;
    const corners = Object.entries(S.scenes).filter(([nm]) => !isTwin(nm) && pick(nm)).flatMap(([, sc]) => sc.corners);
    const ok = corners.filter((c) => c.err);
    const rules = new Set(ok.flatMap((c) => Object.keys(c.err)));
    const seamy = ok.filter((c) => c.seamIn > 0);
    const r = { corners: corners.length, measured: ok.length, seamCorners: seamy.length, rules: {} };
    log(`\n== ${set} ${reg}: ${corners.length} surface corners, ${ok.length} with a vertex, ${seamy.length} with a seam in the cell`);
    for (const rule of [...rules].sort()) {
      const have = ok.filter((c) => c.err[rule]);
      const es = stats(have.map((c) => c.err[rule][0]));
      const er = stats(have.map((c) => c.err[rule][1]));
      const em = stats(seamy.filter((c) => c.err[rule]).map((c) => c.err[rule][2]));
      r.rules[rule] = { coverage: +(have.length / ok.length).toFixed(4), surf: es, ref: er, seam: em };
      log(`  ${rule.padEnd(16)} cover ${(100 * have.length / ok.length).toFixed(1)}%  surf ${fmt(es)}`);
      log(`  ${''.padEnd(16)}              ref  ${fmt(er)}`);
      log(`  ${''.padEnd(16)}              seam ${fmt(em)}`);
    }
    out.rules[`${set}_${reg}`] = r;
  }
}

// ---------- B: context dependence per class ----------
// spread of the reference vertex (canonical frame) across occurrences
out.context = {};
for (const reg of ['FID-0.15', 'FINITE-4']) {
  const tab = JSON.parse(readFileSync(`${ROOT}res/table/${reg}_E2c_n12_clu.json`, 'utf8')).entries;
  for (const set of ['terrain', 'cat', 'builds']) {
    const S = load(set, reg);
    if (!S) continue;
    const by = new Map();
    for (const [nm, sc] of Object.entries(S.scenes)) {
      if (isTwin(nm)) continue;
      for (const c of sc.corners) {
        if (!c.vref) continue;
        const v = symPoint(c.g, c.vref);
        if (!by.has(c.cls)) by.set(c.cls, []);
        by.get(c.cls).push(v);
      }
    }
    const rows = [];
    for (const [cls, vs] of by) {
      const mean = [0, 1, 2].map((t) => vs.reduce((s, v) => s + v[t], 0) / vs.length);
      const spread = vs.reduce((s, v) => s + d3(v, mean), 0) / vs.length;
      const e = tab[cls];
      const tv = e ? (e.vseam && e.seamInCell ? e.vseam : e.vsn) : null;
      rows.push({ cls, key: CL[cls].key, n: vs.length, mean: mean.map((x) => +x.toFixed(3)), spread: +spread.toFixed(4), tableToMean: tv ? +d3(tv, mean).toFixed(4) : null, table: tv });
    }
    rows.sort((a, b) => b.n - a.n);
    out.context[`${set}_${reg}`] = rows;
    log(`\n== context dependence, ${set} ${reg} (canonical frame; spread = mean distance of occurrences to their class mean)`);
    for (const r of rows.slice(0, 14)) log(`  class ${String(r.cls).padStart(3)} ${r.key} n ${String(r.n).padStart(4)}: mean ${JSON.stringify(r.mean)} spread ${r.spread.toFixed(3)} |E2c table - mean| ${r.tableToMean === null ? '-' : r.tableToMean.toFixed(3)}`);
    const tot = rows.reduce((s, r) => s + r.n, 0);
    log(`  occurrence-weighted mean spread ${(rows.reduce((s, r) => s + r.spread * r.n, 0) / tot).toFixed(4)}; weighted |table - class mean| ${(rows.filter((r) => r.tableToMean !== null).reduce((s, r) => s + r.tableToMean * r.n, 0) / rows.filter((r) => r.tableToMean !== null).reduce((s, r) => s + r.n, 0)).toFixed(4)}`);
  }
}

// ---------- C: data-driven tables with larger keys ----------
// window positions w in {0..3}^3 (corner between 1 and 2), index (wy*4+wz)*4+wx
const W64 = [];
for (let wy = 0; wy < 4; wy++) for (let wz = 0; wz < 4; wz++) for (let wx = 0; wx < 4; wx++) W64.push([wx, wy, wz]);
const widx = (x, y, z) => (y * 4 + z) * 4 + x;
const SYM64 = SYMS.map(({ perm, sign }) => W64.map((c) => {
  const q = [0, 1, 2].map((t) => (sign[t] < 0 ? 3 - c[perm[t]] : c[perm[t]]));
  return widx(q[0], q[1], q[2]);
}));
const inCore = (c) => c.every((v) => v === 1 || v === 2);
const isFace = (c) => c.filter((v) => v === 0 || v === 3).length === 1;
const MASKS = {
  K8: W64.map(inCore),
  K32: W64.map((c) => inCore(c) || isFace(c)),
  K64: W64.map(() => true),
};
function canonKey(lab64, mask) {
  let best = null; const gs = [];
  for (let g = 0; g < 48; g++) {
    const img = new Array(64).fill('x');
    for (let i = 0; i < 64; i++) if (mask[i]) img[SYM64[g][i]] = lab64[i];
    const m = new Map(); let s = '';
    for (let i = 0; i < 64; i++) {
      if (!mask[SYM64[0][i]] && img[i] === 'x') continue;
      const v = img[i];
      if (v === 'x') continue;
      if (v === '0' || v === '=' || v === '*') { s += v; continue; }
      if (!m.has(v)) m.set(v, String(m.size + 1));
      s += m.get(v);
    }
    if (best === null || s < best) { best = s; gs.length = 0; gs.push(g); } else if (s === best) gs.push(g);
  }
  return { key: best, gs };
}
// mask positions are symmetric sets, so 'x' cells are the same in every image
// K32eq: each face neighbour reduced to '=' (same as the core block it
// touches), '0' (air, core block solid) or '*' (anything else)
function eqKey(lab64) {
  const a = lab64.split('');
  W64.forEach((c, i) => {
    if (!isFace(c)) return;
    const t = c.findIndex((v) => v === 0 || v === 3);
    const cc = c.slice(); cc[t] = c[t] === 0 ? 1 : 2;
    const core = lab64[widx(cc[0], cc[1], cc[2])];
    a[i] = lab64[i] === core ? '=' : (lab64[i] === '0' ? '0' : '*');
  });
  return a.join('');
}
out.keys = {};
for (const reg of ['FID-0.15', 'FINITE-4']) {
  const S = load('terrain', reg);
  if (!S) continue;
  const tab = JSON.parse(readFileSync(`${ROOT}res/table/${reg}_E2c_n12_clu.json`, 'utf8')).entries;
  const recs = [];
  for (const [nm, sc] of Object.entries(S.scenes)) {
    if (isTwin(nm)) continue;
    const chunk = +nm.slice(1).replace(/[abs].*$/, '');
    for (const c of sc.corners) if (c.vref) recs.push({ ...c, fold: chunk < 8 ? 0 : 1 });
  }
  for (const r of recs) {
    for (const [kn, mask] of Object.entries(MASKS)) r[kn] = canonKey(r.lab64, mask);
    r.K8bin = canonKey(r.lab64.replace(/[1-9]/g, '1'), MASKS.K8); // solid/air only (the bevel table's key)
    r.K32eq = canonKey(eqKey(r.lab64), MASKS.K32); // core materials + 3-state face neighbours
  }
  const res = {};
  log(`\n== data-driven tables, terrain ${reg}: ${recs.length} corners, 2-fold by chunk (train on one half of the bench chunks, test on the other)`);
  // tables per fold for every key, then predictions with a fallback chain:
  // the key itself -> data-driven K8 (same fold) -> E2c class table
  const KN = ['K8bin', 'K8', 'K32eq', 'K32', 'K64'];
  const foldTables = [0, 1].map((fold) => Object.fromEntries(KN.map((kn) => {
    const table = new Map();
    for (const r of recs.filter((x) => x.fold !== fold)) {
      const { key, gs } = r[kn];
      const v = [0, 1, 2].map((t) => gs.reduce((s2, g) => s2 + symPoint(g, r.vref)[t], 0) / gs.length);
      if (!table.has(key)) table.set(key, { sum: [0, 0, 0], n: 0 });
      const e = table.get(key); e.n++; for (let t = 0; t < 3; t++) e.sum[t] += v[t];
    }
    return [kn, table];
  })));
  const predict = (r, kn, fold) => {
    const e = foldTables[fold][kn].get(r[kn].key);
    if (e) return { v: symPointInv(r[kn].gs[0], e.sum.map((x) => x / e.n)), hit: true };
    const e8 = foldTables[fold].K8.get(r.K8.key);
    if (e8) return { v: symPointInv(r.K8.gs[0], e8.sum.map((x) => x / e8.n)), hit: false };
    const t8 = tab[r.cls];
    return { v: t8 && t8.vsn ? symPointInv(r.g, t8.vseam && t8.seamInCell ? t8.vseam : t8.vsn) : [0, 0, 0], hit: false };
  };
  for (const kn of KN) {
    const errs = [], errsFallback = [];
    let covered = 0;
    for (const fold of [0, 1]) for (const r of recs.filter((x) => x.fold === fold)) {
      const p = predict(r, kn, fold);
      if (p.hit) { covered++; errs.push(d3(p.v, r.vref)); }
      errsFallback.push(d3(p.v, r.vref));
    }
    const sizes = [0, 1].map((f) => foldTables[f][kn].size);
    res[kn] = { tableSizes: sizes, coverage: +(covered / recs.length).toFixed(4), refCovered: stats(errs), refWithFallback: stats(errsFallback) };
    log(`  ${kn}: table sizes ${sizes.join('/')}, test coverage ${(100 * covered / recs.length).toFixed(1)}%`);
    log(`      covered corners  ref ${fmt(res[kn].refCovered)}`);
    log(`      all, fallback -> K8 -> E2c ref ${fmt(res[kn].refWithFallback)}`);
  }
  // the terrain-trained K8 table itself (canonical frame of the class representative)
  {
    const tbl = new Map();
    for (const r of recs) {
      const { gs } = r.K8;
      const v = [0, 1, 2].map((t) => gs.reduce((s2, g) => s2 + symPoint(g, r.vref)[t], 0) / gs.length);
      if (!tbl.has(r.cls)) tbl.set(r.cls, []);
      tbl.get(r.cls).push(v);
    }
    const entries = {};
    for (const [cls, vs] of tbl) {
      const mean = [0, 1, 2].map((t) => vs.reduce((s2, v) => s2 + v[t], 0) / vs.length);
      entries[cls] = { key: CL[cls].key, n: vs.length, v: mean.map((x) => +x.toFixed(4)), q256: mean.map((x) => Math.round(x * 256)), spread: +(vs.reduce((s2, v) => s2 + d3(v, mean), 0) / vs.length).toFixed(4) };
    }
    writeFileSync(`${ROOT}res/table-K8-terrain-${reg}.json`, JSON.stringify({ note: 'class -> mean reference vertex over all terrain windows, canonical frame of the class key (position b = ox | oz<<1 | oy<<2); q256 = offsets in 1/256 block', regime: reg, entries }, null, 0));
  }
  // K8 / K8bin tables trained on all terrain corners, applied to builds and the catalogue
  for (const kn of ['K8bin', 'K8']) {
    const table = new Map();
    for (const r of recs) {
      const { key, gs } = r[kn];
      const v = [0, 1, 2].map((t) => gs.reduce((s2, g) => s2 + symPoint(g, r.vref)[t], 0) / gs.length);
      if (!table.has(key)) table.set(key, { sum: [0, 0, 0], n: 0 });
      const e = table.get(key); e.n++; for (let t = 0; t < 3; t++) e.sum[t] += v[t];
    }
    for (const set of ['builds', 'cat']) {
      const S2 = load(set, reg);
      if (!S2) continue;
      const errs = [], errsE2c = [];
      let cov = 0, tot = 0;
      for (const sc of Object.values(S2.scenes)) for (const c of sc.corners) {
        if (!c.vref) continue;
        tot++;
        const k = kn === 'K8' ? canonKey(c.lab64, MASKS.K8) : canonKey(c.lab64.replace(/[1-9]/g, '1'), MASKS.K8);
        const e = table.get(k.key);
        const t8 = tab[c.cls];
        if (t8 && t8.vsn) errsE2c.push(d3(symPointInv(c.g, t8.vseam && t8.seamInCell ? t8.vseam : t8.vsn), c.vref));
        if (!e) continue;
        cov++;
        errs.push(d3(symPointInv(k.gs[0], e.sum.map((x) => x / e.n)), c.vref));
      }
      res[`${kn}_terrainTrained_on_${set}`] = { coverage: +(cov / tot).toFixed(4), ref: stats(errs), refE2cAll: stats(errsE2c) };
      log(`  ${kn} trained on all terrain, applied to ${set}: coverage ${(100 * cov / tot).toFixed(1)}%, covered ref ${fmt(stats(errs))}`);
    }
  }
  // in-sample K64 (memorising every window): the floor of what a key can do
  const distinct = new Map();
  for (const r of recs) { const k = r.K64.key; distinct.set(k, (distinct.get(k) ?? 0) + 1); }
  res.distinctK64 = distinct.size; res.distinctK32 = new Set(recs.map((r) => r.K32.key)).size; res.distinctK8 = new Set(recs.map((r) => r.K8.key)).size;
  log(`  distinct keys over all terrain corners: K8 ${res.distinctK8}, K32 ${res.distinctK32}, K64 ${res.distinctK64} (of ${recs.length} corners)`);
  out.keys[reg] = res;
}

// ---------- D: reproducibility floor (twin windows) ----------
out.twins = {};
for (const reg of ['FID-0.15', 'FINITE-4']) {
  const S = load('terrain', reg);
  if (!S) continue;
  const ds = [];
  for (const [nm, sc] of Object.entries(S.scenes)) {
    if (!isTwin(nm)) continue;
    const base = S.scenes[nm.replace('-shift', '')];
    if (!base) continue;
    const m = new Map(base.corners.filter((c) => c.vref).map((c) => [c.c.join(','), c]));
    for (const c of sc.corners) { const b = m.get(c.c.join(',')); if (b && c.vref) ds.push(d3(b.vref, c.vref)); }
  }
  out.twins[reg] = stats(ds);
  log(`\n== twin windows (same corner, window shifted by (2,0,2)), ${reg}: |vref_a - vref_b| ${fmt(out.twins[reg])}`);
}

// ---------- E/F: resolution and embedding dependence of the class table ----------
const share = JSON.parse(readFileSync(ROOT + 'res/classlist.json', 'utf8')).share;
out.tableDiffs = {};
for (const reg of ['FID-0.15', 'FINITE-4']) {
  const base = JSON.parse(readFileSync(`${ROOT}res/table/${reg}_E2c_n12_clu.json`, 'utf8')).entries;
  for (const other of ['E2c_n16_clu', 'E3c_n12_clu', 'E2m_n12_clu', 'E1m_n12_clu', 'E2c_n12_mat', 'E2c_n12_clu-novol']) {
    const p = `${ROOT}res/table/${reg}_${other}.json`;
    if (!existsSync(p)) continue;
    const o = JSON.parse(readFileSync(p, 'utf8')).entries;
    let wsum = 0, w = 0; const ds = [];
    for (const [cls, e] of Object.entries(o)) {
      const b = base[cls];
      if (!b || !b.vsn || !e.vsn) continue;
      const vb = b.vseam && b.seamInCell ? b.vseam : b.vsn, ve = e.vseam && e.seamInCell ? e.vseam : e.vsn;
      const d = d3(vb, ve);
      ds.push(d);
      const sh = share[cls] ?? 0;
      wsum += d * sh; w += sh;
    }
    out.tableDiffs[`${reg}:${other}`] = { ...stats(ds), shareWeightedMean: w ? +(wsum / w).toFixed(4) : null };
    log(`\n== table ${reg} E2c_n12_clu vs ${other}: |difference| ${fmt(stats(ds))}; frequency-weighted mean ${w ? (wsum / w).toFixed(4) : '-'}`);
  }
}

// ---------- G: per-(corner, material) vertices at seam corners ----------
// separation = largest distance between the per-material vertices of one
// corner (how far apart a split mesh would put them); table error = mean
// over materials of |table vmat - measured vmat| (E2c n12 table)
{
  const TT = buildClassTable();
  const MATS = [0, 6, 7, 1, 4, 2, 3, 5];
  out.vmat = {};
  for (const reg of ['FID-0.15', 'FINITE-4']) {
    const tab = JSON.parse(readFileSync(`${ROOT}res/table/${reg}_E2c_n12_clu.json`, 'utf8')).entries;
    for (const set of ['terrain', 'builds', 'cat']) {
      const S = load(set, reg);
      if (!S) continue;
      const sep = [], errM = [], errOne = [];
      for (const [nm, sc] of Object.entries(S.scenes)) {
        if (isTwin(nm)) continue;
        for (const c of sc.corners) {
          if (!c.vmat || Object.keys(c.vmat).length < 2) continue;
          const vs = Object.values(c.vmat);
          let mx = 0; for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) mx = Math.max(mx, d3(vs[i], vs[j]));
          sep.push(mx);
          // lab8 from lab64 core: w = 1..2 -> b = ox | oz<<1 | oy<<2
          const lab8 = []; for (let b = 0; b < 8; b++) { const ox = b & 1, oz = (b >> 1) & 1, oy = (b >> 2) & 1; lab8.push(+c.lab64[((oy + 1) * 4 + (oz + 1)) * 4 + (ox + 1)]); }
          const { cls, g, back } = classOf(TT, lab8);
          const e = tab[cls];
          if (!e || !e.vmat) continue;
          const es = [], eo = [];
          for (let L = 1; L < back.length; L++) {
            const mOcc = back[L], tv = e.vmat[MATS[L]], ov = c.vmat[mOcc];
            if (!tv || !ov) continue;
            es.push(d3(symPointInv(g, tv), ov));
            eo.push(d3(c.vref, ov));
          }
          if (es.length) { errM.push(es.reduce((a, b) => a + b, 0) / es.length); errOne.push(eo.reduce((a, b) => a + b, 0) / eo.length); }
        }
      }
      out.vmat[`${set}_${reg}`] = { separation: stats(sep), tableVmatErr: stats(errM), oneVertexToVmat: stats(errOne) };
      log(`\n== per-material vertices, ${set} ${reg}: separation ${fmt(stats(sep))}`);
      log(`   E2c table vmat vs measured vmat ${fmt(stats(errM))}`);
      log(`   one measured vertex (vref) vs measured vmat ${fmt(stats(errOne))}`);
    }
  }
}
writeFileSync(ROOT + 'res/analysis.json', JSON.stringify(out));
