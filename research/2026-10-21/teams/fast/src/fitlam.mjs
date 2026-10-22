// Fit a local per-block lambda rule lambda_b = a + b * (1 - n_b/27)^p ... to
// the exact per-material lambdas (model Bx at one sigma) over the catalogue.
// Volume is ~linear in lambda near the surface, so the exact cluster lambda is
// ~ the exposure-weighted mean of the per-block lambdas:
//   lambda_exact(material) ~ sum_b w_b f(n_b) / sum_b w_b
// with w_b = air faces + h * other-material faces of block b, n_b = number of
// same-material blocks in its 3x3x3 neighbourhood (1..27).
//   node fitlam.mjs <t2 results JSON> <modelId> <outJSON>
import { readFileSync, writeFileSync } from 'node:fs';
import { CONFIGS } from '../../../lib/configs.mjs';

export function blockFeatures(blocks) {
  const at = new Map(blocks.map((b) => [`${b[0]},${b[1]},${b[2]}`, b[3]]));
  return blocks.map((b) => {
    let n = 0, air = 0, other = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (at.get(`${b[0] + dx},${b[1] + dy},${b[2] + dz}`) === b[3]) n++;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const m = at.get(`${b[0] + dx},${b[1] + dy},${b[2] + dz}`);
      if (m === undefined) air++; else if (m !== b[3]) other++;
    }
    return { mat: b[3], n, air, other };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inp, id, out] = process.argv.slice(2);
  const r = JSON.parse(readFileSync(inp, 'utf8'));
  const rows = [];
  for (const cfg of CONFIGS) {
    const run = r.runs[cfg.name];
    if (!run || !run.models[id]) continue;
    if (process.env.MAXBLOCKS && cfg.blocks.length > Number(process.env.MAXBLOCKS)) continue;
    const feats = blockFeatures(cfg.blocks);
    // material lambdas: the model stores per-cluster lambdas in engine order; equal within a material
    const mats = [...new Set(cfg.blocks.map((b) => b[3]))];
    // recover per-material lambda: clusters are numbered in block order (engine clusters())
    const order = []; const seen = new Set();
    // the engine numbers clusters by first block; we only need material -> lambda, take the first cluster of each material
    const lam = run.models[id].lambdas;
    // cluster index of each block's first appearance by material, via union-find replica
    const key = (b) => `${b[0]},${b[1]},${b[2]}`;
    const idx = new Map(cfg.blocks.map((b, i) => [key(b), i]));
    const parent = cfg.blocks.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    cfg.blocks.forEach((b, i) => { for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const j = idx.get(`${b[0] + dx},${b[1] + dy},${b[2] + dz}`); if (j !== undefined && cfg.blocks[j][3] === b[3]) parent[find(j)] = find(i); } });
    const rootPhase = new Map();
    cfg.blocks.forEach((b, i) => { const rt = find(i); if (!rootPhase.has(rt)) rootPhase.set(rt, rootPhase.size); });
    const matLam = {};
    cfg.blocks.forEach((b, i) => { const ph = rootPhase.get(find(i)); if (matLam[b[3]] === undefined) matLam[b[3]] = lam[ph]; });
    for (const m of mats) rows.push({ cfg: cfg.name, mat: m, lam: matLam[m], feats: feats.filter((f) => f.mat === m) });
  }
  // model: f(n) = a + b * ((27 - n) / 26) ** p, w = air + h * other; grid search p, h; LSQ for a, b
  let best = null;
  for (const p of [0.5, 1, 1.5, 2, 3, 4]) for (const h of [0, 0.25, 0.5, 1]) {
    // x_row = weighted mean of g(n) = ((27-n)/26)^p ; y = lam ; fit y = a + b x
    const X = [], Y = [];
    for (const row of rows) {
      let sw = 0, sg = 0;
      for (const f of row.feats) { const w = f.air + h * f.other; sw += w; sg += w * ((27 - f.n) / 26) ** p; }
      if (sw === 0) continue;
      X.push(sg / sw); Y.push(row.lam);
    }
    const nn = X.length, mx = X.reduce((s, v) => s + v, 0) / nn, my = Y.reduce((s, v) => s + v, 0) / nn;
    let sxy = 0, sxx = 0; for (let i = 0; i < nn; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; }
    const b = sxy / sxx, a = my - b * mx;
    let sse = 0, worst = 0; for (let i = 0; i < nn; i++) { const e = a + b * X[i] - Y[i]; sse += e * e; worst = Math.max(worst, Math.abs(e)); }
    const rmse = Math.sqrt(sse / nn);
    if (!best || rmse < best.rmse) best = { p, h, a, b, rmse, worst, n: nn };
  }
  const lamRange = [Math.min(...rows.map((r0) => r0.lam)), Math.max(...rows.map((r0) => r0.lam))];
  const res = { source: inp, model: id, rows: rows.length, lamRange, best, table: Array.from({ length: 28 }, (_, n) => (n ? +(best.a + best.b * ((27 - n) / 26) ** best.p).toFixed(4) : null)) };
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ ...res, table: res.table.slice(1).join(' ') }));
}
