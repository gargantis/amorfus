// E4: game constraints under the cheap model. Field Bl-b1s20 (analytic, on a
// grid) and the b1 vertex rule's actual surface-nets mesh (line solver 40
// bisections = converged; Newton 4 = fast's timed default).
//   single-block extent >= 0.40; pillar width >= 0.40; 1x2 passage clear
//   0.70 x 1.90; flat ground stays at its height.
//   node e4-constraints.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { byName } from '../../../lib/configs.mjs';
import { model, Dat, vertexMap, rules, box, A, B, STONE, GRASS, DIRT, r4 } from './common.mjs';
import { tunnelClear, solidRun, topY } from './measure.mjs';
import { buildMesh, meshTunnel, meshSolidExtent, meshFree } from './mesh.mjs';

const [out] = process.argv.slice(2);
const S = {
  single: { blocks: [[0, 0, 0, A]], n: 16 },
  'bump-on-ground': { blocks: [...box(0, 0, 0, 5, 2, 5, STONE), [2, 2, 2, STONE]], n: 12 },
  pillar3: { blocks: byName('pillar3').blocks, n: 16 },
  'pillar3-on-floor': { blocks: [...box(0, 0, 0, 5, 1, 5, STONE), [2, 1, 2, STONE], [2, 2, 2, STONE], [2, 3, 2, STONE]], n: 12 },
  'pillar-floor-to-ceiling': { blocks: [...box(0, 0, 0, 5, 1, 5, STONE), [2, 1, 2, STONE], [2, 2, 2, STONE], ...box(0, 3, 0, 5, 4, 5, STONE)], n: 12 },
  tunnel: { blocks: byName('tunnel').blocks, n: 16, tun: { x0: 1, y0: 1, zs: [0.75, 1.5, 2.25], mz: [1.5] } },
  'tunnel-thick': { blocks: box(0, 0, 0, 5, 5, 4, STONE, (x, y) => x === 2 && (y === 1 || y === 2)), n: 12, tun: { x0: 2, y0: 1, zs: [1.0, 2.0, 3.0], mz: [1.5, 2.0, 2.5] } },
  doorway: { blocks: [...box(0, 0, 0, 7, 1, 5, STONE), ...box(0, 1, 2, 7, 5, 3, STONE, (x, y) => x === 3 && (y === 1 || y === 2))], n: 12, tun: { x0: 3, y0: 1, zs: [2.5], mz: [2.5] } },
  'doorway-2thick': { blocks: [...box(0, 0, 0, 7, 1, 6, STONE), ...box(0, 1, 2, 7, 5, 4, STONE, (x, y) => x === 3 && (y === 1 || y === 2))], n: 12, tun: { x0: 3, y0: 1, zs: [2.5, 3.0, 3.5], mz: [3.0] } },
  'flat-thick': { blocks: box(0, 0, 0, 10, 3, 10, STONE), n: 12, flat: 3 },
  'flat-1thick': { blocks: box(0, 0, 0, 10, 1, 10, STONE), n: 12, flat: 1 },
  'flat-mixed-patch': { blocks: [...box(0, 0, 0, 10, 2, 10, DIRT), ...box(0, 2, 0, 10, 3, 10, GRASS, (x, y, z) => x >= 4 && x <= 6 && z >= 4 && z <= 6), ...box(4, 2, 4, 7, 3, 7, STONE)], n: 12, flat: 3 },
  'flat-checker-top': { blocks: [...box(0, 0, 0, 10, 2, 10, DIRT), ...box(0, 2, 0, 10, 3, 10, 0).map(([x, y, z]) => [x, y, z, (x + z) % 2 ? GRASS : STONE])], n: 12, flat: 3 },
};
const res = { note: 'field = Bl-b1s20 on an n grid; mesh = b1 vertex rule corners + PLAN 7.2 quads (shorter diagonal)', scenes: {} };
const VR = ['bub-b1-line40', 'bub-b1-newton4'];
for (const [name, sc] of Object.entries(S)) {
  const row = { field: {}, mesh: {} };
  const m = model(sc.blocks, 'Bl-b1s20', sc.n);
  const F = (x, y, z) => Dat(m, x, y, z);
  const meshes = {};
  for (const vid of VR) { const offs = vertexMap(sc.blocks, rules[vid]()); meshes[vid] = { offs, tris: buildMesh(sc.blocks, offs) }; }
  if (name === 'single') {
    row.field = { x: solidRun(F, [0.5, 0.5, 0.5], 0), y: solidRun(F, [0.5, 0.5, 0.5], 1), diagEdgeMid: solidRun((x, y, z) => F(x, y, z), [0.5, 0.5, 0.5], 0) };
    for (const vid of VR) row.mesh[vid] = { x: meshSolidExtent(meshes[vid].tris, [0.5, 0.5, 0.5], 0), y: meshSolidExtent(meshes[vid].tris, [0.5, 0.5, 0.5], 1), z: meshSolidExtent(meshes[vid].tris, [0.5, 0.5, 0.5], 2), corner000: meshes[vid].offs.get('0,0,0') };
  }
  if (name === 'bump-on-ground') {
    row.field = { bumpTop: r4(topY(F, 2.5, 2.5, 4)), bumpWidthAtY2_5: solidRun(F, [2.5, 2.5, 2.5], 0) };
    for (const vid of VR) { const t = meshes[vid].tris; const up = meshFree(t, [2.5, 3.5, 2.5], 1); row.mesh[vid] = { bumpTop: r4(up[0]), bumpWidthAtY2_5: meshSolidExtent(t, [2.5, 2.5, 2.5], 0), bumpWidthAtY2_9: meshSolidExtent(t, [2.5, 2.9, 2.5], 0) }; }
  }
  if (name.startsWith('pillar')) {
    const px = name === 'pillar3' ? 0.5 : 2.5, ys = name === 'pillar3' ? [0.5, 1.5, 2.5] : name === 'pillar3-on-floor' ? [1.5, 2.5, 3.5] : [1.5, 2.0, 2.5];
    row.field = Object.fromEntries(ys.map((y) => [`w@y${y}`, solidRun(F, [px, y, px], 0)]));
    for (const vid of VR) row.mesh[vid] = Object.fromEntries(ys.map((y) => [`w@y${y}`, meshSolidExtent(meshes[vid].tris, [px, y, px], 0)]));
  }
  if (sc.tun) {
    row.field = tunnelClear(F, { x0: sc.tun.x0, y0: sc.tun.y0, zs: sc.tun.zs });
    for (const vid of VR) row.mesh[vid] = meshTunnel(meshes[vid].tris, { x0: sc.tun.x0, y0: sc.tun.y0, zs: sc.tun.mz });
  }
  if (sc.flat) {
    // interior top corners (x, z in 2..8): vertex y offsets; field and mesh top heights at block centres and corners
    const top = sc.flat;
    const fieldH = [], meshH = {};
    for (let x = 2; x <= 8; x++) for (let z = 2; z <= 8; z++) for (const [dx, dz] of [[0.5, 0.5], [0, 0], [0.5, 0]]) fieldH.push(topY(F, x + dx, z + dz, top + 1) - top);
    row.field = { topMinus: { min: r4(Math.min(...fieldH)), max: r4(Math.max(...fieldH)), mean: r4(fieldH.reduce((a, b) => a + b, 0) / fieldH.length) } };
    for (const vid of VR) {
      const offs = meshes[vid].offs, hist = {};
      for (let x = 2; x <= 8; x++) for (let z = 2; z <= 8; z++) { const o = offs.get(`${x},${top},${z}`); const k = o ? (o[1] * 256).toFixed(0) + '/256' : 'none'; hist[k] = (hist[k] ?? 0) + 1; }
      const t = meshes[vid].tris, hs = [];
      for (let x = 2; x <= 8; x++) for (let z = 2; z <= 8; z++) for (const [dx, dz] of [[0.5, 0.5], [0.25, 0.25]]) hs.push(meshFree(t, [x + dx, top + 0.5, z + dz], 1)[0] - top);
      row.mesh[vid] = { yOffsetHistogram: hist, meshTopMinus: { min: r4(Math.min(...hs)), max: r4(Math.max(...hs)) } };
      if (sc.flat === 1) { const lo = []; for (let x = 2; x <= 8; x++) for (let z = 2; z <= 8; z++) lo.push(meshFree(t, [x + 0.5, -0.5, z + 0.5], 1)[1]); row.mesh[vid].meshBottom = { min: r4(Math.min(...lo)), max: r4(Math.max(...lo)) }; }
    }
  }
  res.scenes[name] = row;
  console.log(name, 'field', JSON.stringify(row.field).slice(0, 300), '\n   mesh', JSON.stringify(row.mesh).slice(0, 600));
  writeFileSync(out, JSON.stringify(res, null, 1));
}
