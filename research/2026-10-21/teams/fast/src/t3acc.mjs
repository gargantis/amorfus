// Task 3a: how close do surface-nets vertices land to the physics surface?
// Each catalogue configuration is placed in a 38^3 region (apron 3) at
// region offset 12; vertices of every mixed corner come from:
//   cube      offset 0 (Minecraft cube mesh)
//   hints     the repo mesher, default rule, binary input (rho = +-1, every
//             solid block shape-edited, i.e. placed blocks) — relaxation + guard + caps
//   bevel     the repo mesher, rule 'bevel' (section 7.9)
//   bub-b1    bubbleVertices, kernel b1 (8 blocks), local lambda (fitlam-g20)
//   bub-b3    bubbleVertices, kernel b3 (64 blocks), local lambda
//   bub-b1-c0 bubbleVertices, kernel b1, lambda 0 (plain threshold 1/2)
// (sigma 0.4, the FINITE-4 match, needs a 6-wide block stencil: not done here)
// Distances (blocks) from each vertex and each quad centre (mean of its 4
// vertices) to a reference D = 0 surface (cached engine run), measured along
// the reference normal (metrics.mjs distAlong logic).
//   node t3acc.mjs <REGIME> <names|all> <out.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CONFIGS, byName } from '../../../lib/configs.mjs';
import { sampleGrid } from '../../../lib/mbo.mjs';
import { loadRef } from './refs.mjs';
import { meshRegion } from './repo-bundle.mjs';
import { makeRule, bubbleVertices } from './vrule.mjs';

const NR = 38, AP = 3, OFF = 12;
const fitOf = (f) => JSON.parse(readFileSync(new URL(`../res/${f}`, import.meta.url), 'utf8')).best;

export function regionOf(blocks) {
  const reg = new Uint16Array(NR * NR * NR);
  for (const [x, y, z, m] of blocks) reg[(y + OFF) * NR * NR + (z + OFF) * NR + (x + OFF)] = m;
  return reg;
}

export function meshOffsets(reg, params) {
  const total = reg.length;
  const rho = new Float32Array(total), se = new Uint8Array(total);
  for (let i = 0; i < total; i++) { const s = (reg[i] & 0xff) !== 0; rho[i] = s ? 1 : -1; se[i] = s ? 1 : 0; }
  const input = { nx: NR, ny: NR, nz: NR, apron: AP, blocks: reg, rho, shapeEdited: se };
  const res = meshRegion({ ...input, params });
  // the same job with every offset held at 0 emits the same vertices in the
  // same order (same topology), so it names each vertex's corner exactly
  const zero = meshRegion({ ...input, params: { ...params, forceZeroOffsets: true } });
  if (zero.vertexCount !== res.vertexCount) throw new Error('vertex order differs');
  const map = new Map();
  for (let v = 0; v < res.vertexCount; v++) {
    const c = [0, 1, 2].map((t) => Math.round(zero.positions[v * 3 + t]));
    const key = c.join(',');
    if (!map.has(key)) map.set(key, [0, 1, 2].map((t) => res.positions[v * 3 + t] - c[t]));
  }
  return map; // chunk-local corner -> offset
}

export function cornersOf(reg) {
  // mixed corners in the chunk's corner range, chunk-local coords
  const out = [];
  for (let y = AP; y <= AP + 32; y++) for (let z = AP; z <= AP + 32; z++) for (let x = AP; x <= AP + 32; x++) {
    let s = 0;
    for (let j = 0; j < 8; j++) s += (reg[(y - 1 + ((j >> 2) & 1)) * NR * NR + (z - 1 + ((j >> 1) & 1)) * NR + (x - 1 + (j & 1))] & 0xff) ? 1 : 0;
    if (s > 0 && s < 8) out.push([x - AP, y - AP, z - AP]);
  }
  return out;
}

export function quadsOf(reg) {
  // solid/air face pairs inside the chunk: 4 chunk-local corners each
  const q = [];
  const solid = (x, y, z) => (reg[y * NR * NR + z * NR + x] & 0xff) !== 0;
  for (let y = AP; y < AP + 32; y++) for (let z = AP; z < AP + 32; z++) for (let x = AP; x < AP + 32; x++) {
    for (const [ax, dx, dy, dz] of [[0, 1, 0, 0], [1, 0, 1, 0], [2, 0, 0, 1]]) {
      if (solid(x, y, z) === solid(x + dx, y + dy, z + dz)) continue;
      // face plane at the + side of block (x,y,z) on axis ax; corners span the other two axes
      const fx = x + dx, fy = y + dy, fz = z + dz; // lattice coordinate along axis = block + 1
      const cs = ax === 0 ? [[fx, y, z], [fx, y + 1, z], [fx, y + 1, z + 1], [fx, y, z + 1]]
        : ax === 1 ? [[x, fy, z], [x + 1, fy, z], [x + 1, fy, z + 1], [x, fy, z + 1]]
          : [[x, y, fz], [x + 1, y, fz], [x + 1, y + 1, fz], [x, y + 1, fz]];
      q.push(cs.map((c) => [c[0] - AP, c[1] - AP, c[2] - AP]));
    }
  }
  return q;
}

// distance from p to the reference D = 0 set: nearest sign change along the
// reference normal and along 13 fixed directions (axes, face and body
// diagonals; both senses), i.e. an upper bound of the true distance that is
// tight near the surface; capped at 1 block.
const DIRS = (() => {
  const d = [];
  for (const v of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]]) {
    const l = Math.hypot(...v); d.push(v.map((x) => x / l));
  }
  return d;
})();
function distToSurf(sim, p) {
  const f = (x) => sampleGrid(sim, sim.D, x[0], x[1], x[2]);
  const e = 0.02;
  const g = [(f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]])), (f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]])), (f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e]))];
  const l = Math.hypot(...g);
  const dirs = l > 1e-9 ? [g.map((v) => v / l), ...DIRS] : DIRS;
  const f0 = f(p);
  let best = 1, found = false;
  for (const n of dirs) {
    for (let s = 0.005; s <= best + 1e-9; s += 0.005) {
      let hit = 0;
      for (const sg of [1, -1]) {
        const y = [p[0] + n[0] * s * sg, p[1] + n[1] * s * sg, p[2] + n[2] * s * sg];
        if ((f(y) > 0) !== (f0 > 0)) { hit = sg; break; }
      }
      if (hit) {
        let a = s - 0.005, b = s;
        for (let i = 0; i < 16; i++) { const m = 0.5 * (a + b); const ym = [p[0] + n[0] * m * hit, p[1] + n[1] * m * hit, p[2] + n[2] * m * hit]; if ((f(ym) > 0) === (f0 > 0)) a = m; else b = m; }
        if (0.5 * (a + b) < best) { best = 0.5 * (a + b); found = true; }
        break;
      }
    }
  }
  return { d: best, inside: f0 > 0, miss: !found };
}

const stats = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  return { n: s.length, mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(4), p95: +s[Math.floor(0.95 * (s.length - 1))].toFixed(4), max: +s[s.length - 1].toFixed(4) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const [regime, names, out] = process.argv.slice(2);
  const pick = names === 'all' ? CONFIGS : names.split(',').map((n) => byName(n));
  const L20 = fitOf('fitlam-g20.json');
  const RULES = {
    'bub-b1': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 } }),
    'bub-b3': makeRule({ kernel: 'b3', sigma: 0.2, lambda: { local: L20 } }),
    'bub-b1-c0': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { const: 0 } }),
    'bub-b1-line': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 }, solver: 'line' }),
    'bub-b1-a75': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 }, alpha: 0.75 }),
    'bub-b1-a50': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 }, alpha: 0.5 }),
  };
  const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { regime, note: 'distances in blocks; vertex = per mixed corner; quad = mean of 4 corner vertices', runs: {} };
  for (const cfg of pick) {
    const { sim } = loadRef(regime, cfg);
    const reg = regionOf(cfg.blocks);
    const corners = cornersOf(reg);
    const quads = quadsOf(reg);
    const offsets = {};
    offsets.cube = new Map(corners.map((c) => [c.join(','), [0, 0, 0]]));
    offsets.hints = meshOffsets(reg, {});
    offsets.bevel = meshOffsets(reg, { rule: 'bevel' });
    for (const [id, rule] of Object.entries(RULES)) {
      const r = bubbleVertices(reg, NR, NR, NR, AP, rule);
      const m = new Map();
      for (let v = 0; v < r.count; v++) m.set([r.corner[v * 3] - AP, r.corner[v * 3 + 1] - AP, r.corner[v * 3 + 2] - AP].join(','), [r.off[v * 3], r.off[v * 3 + 1], r.off[v * 3 + 2]]);
      offsets[id] = m;
    }
    const row = {};
    for (const [id, m] of Object.entries(offsets)) {
      // world (config) coords of chunk-local corner c: c + AP - OFF
      const P = (c) => { const o = m.get(c.join(',')) ?? [0, 0, 0]; return [c[0] + AP - OFF + o[0], c[1] + AP - OFF + o[1], c[2] + AP - OFF + o[2]]; };
      const vd = [], vs = [], qd = [];
      let missing = 0;
      for (const c of corners) {
        if (!m.has(c.join(','))) missing++;
        const r = distToSurf(sim, P(c));
        if (r) { vd.push(r.d); vs.push(r.inside ? -r.d : r.d); }
      }
      const pd = [];
      for (const q of quads) {
        const ps = q.map(P);
        const ctr = [0, 1, 2].map((t) => (ps[0][t] + ps[1][t] + ps[2][t] + ps[3][t]) / 4);
        const r = distToSurf(sim, ctr);
        if (r) qd.push(r.d);
        // bilinear patch samples (u, v in {1/6, 1/2, 5/6}): the mesh surface itself
        for (const u of [1 / 6, 0.5, 5 / 6]) for (const v of [1 / 6, 0.5, 5 / 6]) {
          const x = [0, 1, 2].map((t) => (1 - u) * (1 - v) * ps[0][t] + u * (1 - v) * ps[1][t] + u * v * ps[2][t] + (1 - u) * v * ps[3][t]);
          const rr = distToSurf(sim, x);
          if (rr) pd.push(rr.d);
        }
      }
      row[id] = { vertex: stats(vd), quad: stats(qd), patch: stats(pd), vertexBias: +(vs.reduce((a, b) => a + b, 0) / Math.max(1, vs.length)).toFixed(4), missing };
    }
    res.runs[cfg.name] = { corners: corners.length, quads: quads.length, rules: row };
    console.log(cfg.name, corners.length, 'corners', Object.entries(row).map(([id, r]) => `${id} v${r.vertex.mean} q${r.quad.mean} P${r.patch.mean}/${r.patch.p95}${r.missing ? ' miss' + r.missing : ''}`).join(' | '));
    writeFileSync(out, JSON.stringify(res, null, 1));
  }
}
