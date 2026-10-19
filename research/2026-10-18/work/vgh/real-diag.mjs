// VGH: diagnose the real-terrain 2-block-rise climbs from bypass-real.mjs
// (natural 1-block terrace edge + a 3×2 placed patch flush on the upper side).
// For each listed edge: which approach climbs, the exact slice profile along
// the walk line for hints and gh-cc8b, and the riser's steepest segments.
//   node work/vgh/real-diag.mjs
import { join } from 'node:path';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { VARIANTS } from './phys.mjs';
import * as P from '../vgs/physics-real.mjs';
import * as core from '../../harness/core.mjs';
import { slice, plotProfiles, IMG } from './viz.mjs';

const EDGES = (process.env.EDGES ?? '-2,1,1:5:1:11;-3,1,0:4:-1:9;-2,1,0:19:-1:8;-2,1,0:19:-1:9;-2,1,0:20:-1:5;0,1,2:12:-1:12;-3,1,0:4:-1:8').split(';').map((s) => {
  const [c, x, dir, z] = s.split(':');
  return { c: c.split(',').map(Number), x: Number(x), dir: Number(dir), z: Number(z) };
});
const VARS = (process.env.VARS ?? 'hints,gs-ctx,gh-cc8b').split(',');
const STONE = 3, A = 10;
const IDLE = { move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false };
const COL = { hints: [0, 90, 200], 'gs-ctx': [0, 160, 0], 'gh-cc8b': [210, 30, 30] };
for (const { c: [cx, cy, cz], x, dir, z } of EDGES) {
  const base = buildGenMeshInput([1, 1], cx, cy, cz, new Map(), { forceApron: A }).input;
  const n = base.nx;
  const ri = (X, Y, Z) => ((Y + A) * n + (Z + A)) * n + (X + A);
  const solid = (X, Y, Z) => (base.blocks[ri(X, Y, Z)] & 0xff) !== 0;
  const H = (X, Z) => { for (let y = 27; y >= 1; y--) if (solid(X, y, Z) && !solid(X, y + 1, Z)) return y; return -99; };
  const h = H(x, z);
  // hint phase of the lower and upper ground: surface height from rho on the column
  const surf = (X, Z) => { const y = H(X, Z); const r0 = base.rho[ri(X, y, Z)], r1 = base.rho[ri(X, y + 1, Z)]; return y + 0.5 + r0 / (r0 - r1); };
  console.log(`chunk ${cx},${cy},${cz} edge x=${x}${dir > 0 ? '→' : '←'} z=${z} h=${h}: lower surface ${surf(x, z).toFixed(2)} (φ ${(surf(x, z) - h - 1).toFixed(2)}), upper ${surf(x + dir, z).toFixed(2)} (φ ${(surf(x + dir, z) - h - 2).toFixed(2)}); columns along the walk: ${[-3, -2, -1, 0, 1, 2, 3, 4].map((k) => H(x + dir * k, z)).join(' ')}; neighbours z±1,±2 at x: ${[-2, -1, 1, 2].map((dz) => H(x, z + dz)).join(' ')} at x+dir: ${[-2, -1, 1, 2].map((dz) => H(x + dir, z + dz)).join(' ')}`);
  const lines = [];
  for (const vn of VARS) {
    const V = VARIANTS[vn];
    const blocks = base.blocks.slice(), rho = base.rho.slice(), ed = base.shapeEdited.slice();
    for (let dz = -1; dz <= 1; dz++) for (let k = 1; k <= 2; k++) { const i = ri(x + dir * k, h + 2, z + dz); blocks[i] = STONE; rho[i] = 1; ed[i] = 1; }
    const raw = V.mesh({ ...base, blocks, rho, shapeEdited: ed, params: V.params });
    const src = { chunkAt: (a, b, c2) => (a === cx && b === cy && c2 === cz ? { origin: [cx * 32, cy * 32, cz * 32], positions: raw.positions, indexData: raw.indexData, pickRecords: raw.pickRecords, pickOffsets: raw.pickOffsets } : null) };
    const out = [];
    for (const sprint of [false, true]) {
      let s = { position: [cx * 32 + x - dir * 1.0 + 0.5, cy * 32 + h + 1.6, cz * 32 + z + 0.5], velocity: [0, 0, 0], onGround: false, flying: false };
      const inp = { ...IDLE, move: [0, 1], yaw: dir > 0 ? -Math.PI / 2 : Math.PI / 2, sprint };
      let firstAbove = null;
      for (let t = 0; t < 2.2; t += 1 / 60) {
        s = P.stepPlayer(src, s, inp, 1 / 60);
        const ly = s.position[1] - cy * 32;
        if (firstAbove === null && ly > h + 2.6) firstAbove = `${(s.position[0] - cx * 32).toFixed(2)},${ly.toFixed(2)},z${(s.position[2] - cz * 32).toFixed(2)}`;
      }
      const lx = s.position[0] - cx * 32, ly = s.position[1] - cy * 32;
      const up = (dir > 0 ? lx > x + 1.6 : lx < x - 0.6) && ly > h + 2.6;
      out.push(`${sprint ? 'sprint' : 'walk'} ${up ? 'CLIMBED' : 'blocked'} end ${lx.toFixed(2)},${ly.toFixed(2)},z${(s.position[2] - cz * 32).toFixed(2)}${firstAbove ? ` first>h+2.6 at ${firstAbove}` : ''}`);
    }
    // profile on the slice z = z + 0.5 (chunk-local mesh coordinates)
    const mesh = core.decodeMesh(raw);
    const segs = slice(mesh, 2, z + 0.5).filter((sg) => Math.min(sg[0], sg[2]) > x - 4 && Math.max(sg[0], sg[2]) < x + 5 && Math.max(sg[1], sg[3]) > h - 1);
    let steep = [];
    for (const [u0, y0, u1, y1] of segs) {
      const du = Math.abs(u1 - u0), dy = Math.abs(y1 - y0);
      const ang = (Math.atan2(dy, du) * 180) / Math.PI;
      if (dy > 0.05 && Math.max(y0, y1) > h + 0.8) steep.push([Math.min(y0, y1), Math.max(y0, y1), ang, Math.min(u0, u1)]);
    }
    steep.sort((a, b) => a[0] - b[0]);
    out.push('riser segs (y0..y1 @angle): ' + steep.map(([a, b, g, u]) => `${a.toFixed(2)}..${b.toFixed(2)}@${g.toFixed(0)}°(u${u.toFixed(2)})`).join(' '));
    console.log(`   ${vn.padEnd(8)} ${out.join(' | ')}`);
    lines.push({ segs, rgb: COL[vn] ?? [0, 0, 0], w: 1 });
  }
  const f = join(IMG, `real-diag-${cx}_${cy}_${cz}-x${x}${dir > 0 ? 'p' : 'm'}-z${z}.png`);
  plotProfiles(f, {
    u0: x - 4, u1: x + 5, y0: h - 1, y1: h + 4, S: 70,
    cells: (u, y) => { if (u < x - 4 || u > x + 5) return 0; const i = ri(u, y, z); const k = (u - x) * dir; if ((k === 1 || k === 2) && y === h + 2) return 2; return (base.blocks[i] & 0xff) !== 0 ? 1 : 0; },
    lines,
  });
  console.log('   ' + f);
}
