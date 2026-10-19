// Sweep shading variants (gn mesher params) over the geometry scenes and
// the two bench terrain chunks; prints shading rms/max and AO roughness.
//   node work/gn/explore.mjs <set>
import * as core from '../../harness/core.mjs';
import { GEOMETRY_SCENES } from '../../harness/scenes.mjs';
import { geometryMetrics } from '../../harness/metrics.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion } from './mesher-gn.mjs';
import { SETS } from './variants.mjs';

const set = process.argv[2] ?? 'ao';
const variants = SETS[set];
const scenes = GEOMETRY_SCENES.filter((s) => s.ideal.sdf);
const regions = scenes.map((s) => core.buildRegion(s.cell, 12));
const qkey = (pos, v) => `${Math.round(pos[v * 3] * 256)},${Math.round(pos[v * 3 + 1] * 256)},${Math.round(pos[v * 3 + 2] * 256)}`;
export function aoRoughAll(mesh) {
  // the harness's AO roughness over every vertex of the mesh
  const byKey = new Map();
  for (let v = 0; v < mesh.V; v++) { const k = qkey(mesh.pos, v); if (!byKey.has(k)) byKey.set(k, mesh.ao[v]); }
  const nb = new Map();
  for (let t = 0; t < mesh.T; t++) for (let e = 0; e < 3; e++) {
    const ka = qkey(mesh.pos, mesh.tri[t * 3 + e]), kb = qkey(mesh.pos, mesh.tri[t * 3 + ((e + 1) % 3)]);
    if (!nb.has(ka)) nb.set(ka, new Set()); if (!nb.has(kb)) nb.set(kb, new Set());
    nb.get(ka).add(kb); nb.get(kb).add(ka);
  }
  let s2 = 0, n = 0;
  for (const [k, set] of nb) { let s = 0, c = 0; for (const o of set) { s += byKey.get(o); c++; } const d = byKey.get(k) - s / c; s2 += d * d; n++; }
  return Math.sqrt(s2 / n);
}
const TERRAIN = [[-1, 1, 1], [0, 0, -3]];
const tin = TERRAIN.map((c) => buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 12 }).input);
const f1 = (v) => v.toFixed(1), f3 = (v) => v.toFixed(3);
console.log(['variant', ...scenes.map((s) => s.name), 'mtn ao', 'beach ao', 'ms'].join(' | '));
for (const [label, params] of Object.entries(variants)) {
  const cells = [];
  let ms = 0;
  scenes.forEach((s, i) => {
    const t0 = performance.now();
    const m = core.decodeMesh(meshRegion({ ...regions[i], params }));
    ms += performance.now() - t0;
    const flat = (params.rule === 'bevel' && params.faceted !== false);
    const g = geometryMetrics(m, s, { flatShading: false });
    cells.push(`${f1(g.shadingNormal.rms)}/${f1(g.shadingNormal.max)} ${f3(g.aoRough.rms)}`);
  });
  for (const inp of tin) {
    const m = core.decodeMesh(meshRegion({ ...inp, params }));
    cells.push(f3(aoRoughAll(m)));
  }
  console.log([label, ...cells, ms.toFixed(0)].join(' | '));
}
