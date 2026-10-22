// Task 4: which physical features survive in the cheap models?
// Measured on D fields (D > 0 solid; references: engine finish() field, which
// re-blurs labels with renderS = 2 sub-cells and rounds creases by ~0.1 block;
// models: analytic field). Also on the b1 vertex rule's corner vertices.
//   node t4feat.mjs <out.json>
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { byName } from '../../../lib/configs.mjs';
import { sampleGrid, simulate } from '../../../lib/mbo.mjs';
import { loadRef, runAndCache, cachePath } from './refs.mjs';
import { makeModel, refCm } from './t2.mjs';
import { MODELS } from './models.mjs';
import { fieldView } from './metrics.mjs';
import { makeRule, bubbleVertices } from './vrule.mjs';
import { regionOf, meshOffsets } from './t3acc.mjs';

const [out] = process.argv.slice(2);
const REFS = ['FID-0.15', 'FINITE-4', 'FREE'];
const MODS = ['A0-g20', 'Bl-b1s20', 'Bx-g20', 'Bl-b3s40', 'Bx-g40'];
const CFGS = ['single', 'pair-same', 'pair-diff', 'sq2-AABC', 'diag-edge', 'diag-edge-diff', 'slab-line', 'tunnel', 'pillar3'];
const FREE_OK = new Set(['single', 'pair-same', 'pair-diff', 'sq2-AABC', 'diag-edge', 'diag-edge-diff', 'pillar3']);

// solid extent along a segment through p in direction d: the D > 0 run containing p
function extent(V, p, d, maxT = 3) {
  const at = (t) => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
  if (!(V.D(p) > 0)) return 0;
  const edge = (sg) => { let t = 0; while (t < maxT && V.D(at(sg * (t + 0.002))) > 0) t += 0.002; return t; };
  return +(edge(1) + edge(-1)).toFixed(3);
}
// height of the top surface above (x, z), searching down from yTop
function topH(V, x, z, yTop = 2.5, yBot = -1) {
  for (let y = yTop; y > yBot; y -= 0.002) if (V.D([x, y, z]) > 0) return y;
  return null;
}
const deg = (r) => +(r * 180 / Math.PI).toFixed(1);

function features(name, V) {
  const f = {};
  if (name === 'single') { f.extentX = extent(V, [0.5, 0.5, 0.5], [1, 0, 0]); f.extentDiag = extent(V, [0.5, 0.5, 0.5], [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]); }
  if (name === 'pair-same' || name === 'pair-diff') {
    // top profile along x at z = 0.5; dip at the joint x = 1
    const h = (x) => topH(V, x, 0.5);
    const h1 = h(1), hl = h(0.75), hr = h(1.25);
    f.top_at_joint = h1 && +h1.toFixed(3); f.top_at_0_75 = hl && +hl.toFixed(3);
    f.dip = +(0.5 * (hl + hr) - h1).toFixed(4);
    // groove opening angle (in air) from slopes fitted on 0.10..0.25 each side
    const slope = (a, b) => { const n = 8; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { const x = a + (b - a) * i / (n - 1); const y = h(x); sx += x; sy += y; sxx += x * x; sxy += x * y; } return (n * sxy - sx * sy) / (n * sxx - sx * sx); };
    const sl = slope(0.75, 0.9), sr = slope(1.1, 1.25);
    // angle in air between the two side surfaces next to the joint (180 = flat; < 180 = V groove; > 180 = ridge)
    f.sideAngleAir = deg(Math.PI - Math.atan(-sl) - Math.atan(sr));
    f.slopes = [+sl.toFixed(3), +sr.toFixed(3)];
  }
  if (name === 'sq2-AABC') {
    // plan at y = 0.5: A = (0..2, z 0..1), B = (0..1, z 1..2), C = (1..2, z 1..2)
    const seamZ = (x) => { // A|B or A|C seam position along z at fixed x
      let prev = V.owner([x, 0.5, 0.6]), lo = 0.6;
      for (let z = 0.6; z <= 1.6; z += 0.002) { const o = V.D([x, 0.5, z]) > 0 ? V.owner([x, 0.5, z]) : 0; if (o !== prev) return z; prev = o; lo = z; }
      return null;
    };
    const seamX = (z) => { // B|C seam position along x at fixed z
      let prev = V.owner([0.6, 0.5, z]);
      for (let x = 0.6; x <= 1.4; x += 0.002) { const o = V.D([x, 0.5, z]) > 0 ? V.owner([x, 0.5, z]) : 0; if (o !== prev) return x; prev = o; }
      return null;
    };
    const zAB = [seamZ(0.6), seamZ(0.85)], zAC = [seamZ(1.4), seamZ(1.15)], xBC = [seamX(1.4), seamX(1.15)];
    f.seams = { zAB, zAC, xBC };
    if (zAB.every((v) => v !== null) && zAC.every((v) => v !== null) && xBC.every((v) => v !== null)) {
      // directions pointing away from the junction
      const dAB = [0.6 - 0.85, zAB[0] - zAB[1]], dAC = [1.4 - 1.15, zAC[0] - zAC[1]], dBC = [xBC[0] - xBC[1], 1.4 - 1.15];
      const ang = (a, b) => deg(Math.acos((a[0] * b[0] + a[1] * b[1]) / Math.hypot(...a) / Math.hypot(...b)));
      f.junctionAngles = { AB_AC: ang(dAB, dAC), AB_BC: ang(dAB, dBC), AC_BC: ang(dAC, dBC) };
    }
  }
  if (name === 'diag-edge' || name === 'diag-edge-diff') {
    const e = [1, 0.5, 1];
    f.D_at_edge = +V.D(e).toFixed(4);
    f.connected = V.D(e) > 0;
    f.neckWidth = extent(V, e, [Math.SQRT1_2, 0, -Math.SQRT1_2]);
    if (f.connected) f.ownerAtEdge = V.owner(e);
  }
  if (name === 'slab-line') {
    // A blocks on the diagonal (i, 0, i); contacts at edges (i+1, y, i+1). Is the edge midpoint A-owned and solid?
    let united = 0; const vals = [];
    for (let i = 0; i < 5; i++) { const p = [i + 1, 0.5, i + 1]; const solid = V.D(p) > 0; const o = solid ? V.owner(p) : 0; vals.push(o); if (o === 6) united++; }
    f.edgeOwners = vals; f.A_contacts_united = united;
  }
  if (name === 'tunnel') {
    // 1x2 hole x in [1,2], y in [1,3], along z; measure at z = 1.5
    const gap = (p, d) => { const at = (t) => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t]; if (V.D(p) > 0) return 0; let a = 0, b = 0; while (a < 2 && !(V.D(at(a)) > 0)) a += 0.002; while (b < 2 && !(V.D(at(-b)) > 0)) b += 0.002; return +(a + b).toFixed(3); };
    f.width_mid = gap([1.5, 2, 1.5], [1, 0, 0]); f.height_mid = gap([1.5, 2, 1.5], [0, 1, 0]);
    f.width_at_y1_2 = gap([1.5, 1.2, 1.5], [1, 0, 0]); f.width_at_y2_8 = gap([1.5, 2.8, 1.5], [1, 0, 0]);
  }
  if (name === 'pillar3') { f.width_mid = extent(V, [0.5, 1.5, 0.5], [1, 0, 0]); f.diag_mid = extent(V, [0.5, 1.5, 0.5], [Math.SQRT1_2, 0, Math.SQRT1_2]); }
  return f;
}

// the vertex rules on the same configurations (corner vertices; quads are flat between them)
function vertexFeatures(name, offs) {
  const P = (x, y, z) => { const k = [x + 12, y + 12, z + 12].join(','); const o = offs.get(k); return o ? [x + o[0], y + o[1], z + o[2]] : null; };
  const f = {};
  if (name === 'single') { const a = P(0, 0, 0), b = P(1, 1, 1); f.extentDiag = a && b && +Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]).toFixed(3); f.extentX_edges = a && P(1, 0, 0) && +(P(1, 0, 0)[0] - a[0]).toFixed(3); }
  if (name === 'pair-diff' || name === 'pair-same') { const m = P(1, 1, 0), e = P(0, 1, 0); f.joint_top_y = m && +m[1].toFixed(3); f.end_top_y = e && +e[1].toFixed(3); }
  if (name === 'tunnel') {
    // corner vertices of the hole at z = 1: floor (1,1),(2,1); ceiling (1,3),(2,3); wall mid (1,2),(2,2)
    const fl = [P(1, 1, 1), P(2, 1, 1)], ce = [P(1, 3, 1), P(2, 3, 1)], wm = [P(1, 2, 1), P(2, 2, 1)];
    if (wm[0] && wm[1]) f.width_wallmid = +(wm[1][0] - wm[0][0]).toFixed(3);
    if (fl[0] && fl[1]) f.width_floor_edge = +(fl[1][0] - fl[0][0]).toFixed(3);
    if (fl[0] && ce[0]) f.height_side = +(ce[0][1] - fl[0][1]).toFixed(3);
  }
  if (name === 'pillar3') { const a = P(0, 1, 0), b = P(1, 1, 0); f.width_x = a && b && +(b[0] - a[0]).toFixed(3); }
  if (name === 'diag-edge') { const c = P(1, 1, 1); f.edgeCornerTop = c && c.map((v) => +v.toFixed(3)); }
  return f;
}

const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { note: 'field features on D; vertex features on corner vertices (chunk-local corner lookups)', fields: {}, vertices: {} };
const L20 = JSON.parse(readFileSync(new URL('../res/fitlam-g20.json', import.meta.url), 'utf8')).best;
const vr = { 'bub-b1': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 } }), 'bub-b1-c0': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { const: 0 } }) };
for (const name of CFGS) {
  const cfg = byName(name);
  res.fields[name] = res.fields[name] ?? {};
  for (const rg of REFS) {
    if (rg === 'FREE' && !FREE_OK.has(name)) continue;
    if (!existsSync(cachePath(rg, name) + '.json')) runAndCache(rg, cfg);
    const { sim } = loadRef(rg, cfg);
    res.fields[name][rg] = features(name, fieldView(sim, sim.D, refCm(sim)));
  }
  for (const id of MODS) { const m = makeModel(cfg, MODELS[id]); res.fields[name][id] = features(name, fieldView(m, m.D, m.Cm)); }
  const reg = regionOf(cfg.blocks);
  res.vertices[name] = {};
  for (const [id, rule] of Object.entries(vr)) {
    const r = bubbleVertices(reg, 38, 38, 38, 3, rule);
    const offs = new Map();
    for (let v = 0; v < r.count; v++) offs.set([r.corner[v * 3], r.corner[v * 3 + 1], r.corner[v * 3 + 2]].join(','), [r.off[v * 3], r.off[v * 3 + 1], r.off[v * 3 + 2]]);
    res.vertices[name][id] = vertexFeatures(name, offs);
  }
  for (const [id, params] of [['bevel', { rule: 'bevel' }], ['hints', {}]]) {
    const mo = meshOffsets(reg, params); // chunk-local keys
    const offs = new Map([...mo.entries()].map(([k, v]) => [k.split(',').map((q) => Number(q) + 3).join(','), v]));
    res.vertices[name][id] = vertexFeatures(name, offs);
  }
  console.log(name, JSON.stringify(res.fields[name]), '\n   vertices', JSON.stringify(res.vertices[name]));
  writeFileSync(out, JSON.stringify(res, null, 1));
}
void simulate; void sampleGrid;
