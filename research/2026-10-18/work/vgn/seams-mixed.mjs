// vgn: chunk-seam test with PRODUCTION apron selection (buildGenMeshInput
// without forceApron): an edit at distance d (0…14) from the shared border,
// on either side, so pairs come out 10/10, 10/3 or 3/10. Every vertex the two
// chunks both emit on the shared plane (keyed by WORLD lattice corner +
// material + sharp) must have identical bytes (position, AO, flags, normal).
// Also edge-diagonal neighbours (shared line) for the d ≤ 3 cases.
//   node work/vgn/seams-mixed.mjs [gn|prod]
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion } from '../gn/mesher-gn.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { setBlock } from './util.mjs';
const which = process.argv[2] ?? 'gn';
const params = which === 'gn' ? PARAMS : {};
const seed = [1, 1];
const PLANKS = 5, STONE = 3, AIR = 0, BRICK = 6, SHARP = 256;
const cache = new Map();
function topAt(wx, wz) {
  for (let cy = 3; cy >= -1; cy--) {
    const k = `${Math.floor(wx / 32)},${cy},${Math.floor(wz / 32)}`;
    let inp = cache.get(k);
    if (!inp) { inp = buildGenMeshInput(seed, Math.floor(wx / 32), cy, Math.floor(wz / 32), new Map(), { forceApron: 0 }).input; cache.set(k, inp); }
    const lx = wx - Math.floor(wx / 32) * 32, lz = wz - Math.floor(wz / 32) * 32;
    for (let y = 31; y >= 0; y--) if ((inp.blocks[(y * 32 + lz) * 32 + lx] & 0xff) !== 0) return cy * 32 + y;
  }
}
function verts(c, edits) {
  const { input, apron } = buildGenMeshInput(seed, c[0], c[1], c[2], edits, {});
  const m = meshRegion({ ...input, params });
  const u8 = new Uint8Array(m.vertexData);
  const map = new Map();
  for (let v = 0; v < m.vertexCount; v++) {
    const wc = [c[0] * 32 + m.corners[v * 3], c[1] * 32 + m.corners[v * 3 + 1], c[2] * 32 + m.corners[v * 3 + 2]];
    const flags = u8[v * 16 + 7], mat = u8[v * 16 + 12];
    let k = `${wc},${mat},${flags & 1}`;
    if (flags & 1) k += `,${u8[v * 16 + 8]},${u8[v * 16 + 9]},${u8[v * 16 + 10]},${u8[v * 16 + 11]}`;
    const bytes = Array.from(u8.subarray(v * 16, v * 16 + 12));
    // positions are chunk-relative: compare world-relative fixed-point instead
    const u16 = new Uint16Array(m.vertexData, v * 16, 3);
    const wp = [c[0] * 8192 + u16[0], c[1] * 8192 + u16[1], c[2] * 8192 + u16[2]];
    map.set(k, `${wp}|${bytes.slice(6, 12)}`);
  }
  return { map, apron };
}
function compare(a, b, edits) {
  const A = verts(a, edits), B = verts(b, edits);
  let shared = 0, diff = 0, ex = '';
  for (const [k, va] of A.map) { const vb = B.map.get(k); if (vb === undefined) continue; shared++; if (vb !== va) { diff++; if (!ex) ex = `${k}: ${va} vs ${vb}`; } }
  return { shared, diff, ap: `${A.apron}/${B.apron}`, ex };
}
// pairs whose border carries surface (seed [1,1], mountain area)
const PAIRS = [
  ['x', [-2, 1, 1], [-1, 1, 1]],
  ['z', [-1, 1, 1], [-1, 1, 2]],
  ['y', [-1, 0, 0], [-1, 1, 0]],
];
const BUILDS = {
  wall: (e, x, z, along) => { for (let t = 0; t < 4; t++) { const xx = along === 'x' ? x : x + t, zz = along === 'x' ? z + t : z; const top = topAt(xx, zz); for (let h = 1; h <= 3; h++) setBlock(e, xx, top + h, zz, PLANKS); } },
  dig: (e, x, z) => { for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) { const top = topAt(x + dx, z + dz); for (let h = 0; h < 2; h++) setBlock(e, x + dx, top - h, z + dz, AIR); } },
  sharp: (e, x, z) => { const top = topAt(x, z); for (let h = 1; h <= 2; h++) setBlock(e, x, top + h, z, BRICK | SHARP); setBlock(e, x + 1, topAt(x + 1, z) + 1, z, PLANKS); },
};
let total = 0, bad = 0;
const apSeen = new Set();
for (const [ax, a, b] of PAIRS) {
  for (const [bname, build] of Object.entries(BUILDS)) {
    const line = [];
    for (const side of [-1, 1]) for (let d = 0; d <= 14; d++) {
      const e = new Map();
      if (ax === 'y') {
        // vertical pair: the build sits on the surface; shift the pair instead
        continue;
      }
      // border plane at world coord = b's origin along ax; build at distance d on side (−1: in a, +1: in b)
      const border = (ax === 'x' ? b[0] : b[2]) * 32;
      const p = side < 0 ? border - 1 - d : border + d;
      const other = (ax === 'x' ? a[2] : a[0]) * 32 + 14;
      if (ax === 'x') build(e, p, other, 'x'); else build(e, other, p, 'z');
      const r = compare(a, b, e);
      total++; apSeen.add(r.ap);
      if (r.diff) { bad++; line.push(`d=${side * (d + (side < 0 ? 1 : 0))}:${r.ap} ${r.diff}/${r.shared} ✗ ${r.ex}`); }
      else line.push(`${side < 0 ? '-' : '+'}${d}:${r.ap}(${r.shared})`);
    }
    if (line.length) console.log(`${ax} ${bname}: ${line.join(' ')}`);
  }
}
// vertical pair: builds on the surface right at / above the y border of chunk cy 0|1 (world y 32)
{
  const [ax, a, b] = PAIRS[2];
  // find a column where the surface is near y = 32 inside chunk x,z = -1,0
  let best = null;
  for (let x = -32; x < 0; x++) for (let z = 0; z < 32; z++) { const t = topAt(x, z); if (!best || Math.abs(t - 31) < Math.abs(best[2] - 31)) best = [x, z, t]; }
  console.log(`y pair: surface column ${best} (border y = 32)`);
  for (const [bname, build] of Object.entries(BUILDS)) {
    const line = [];
    for (let dx = -14; dx <= 14; dx += 2) {
      const e = new Map();
      build(e, best[0] + dx, best[1], 'x');
      const r = compare(a, b, e);
      total++; apSeen.add(r.ap);
      if (r.diff) { bad++; line.push(`dx=${dx}:${r.ap} ${r.diff}/${r.shared} ✗ ${r.ex}`); } else line.push(`${dx}:${r.ap}(${r.shared})`);
    }
    console.log(`y ${bname}: ${line.join(' ')}`);
  }
}
// edge-diagonal neighbours (share the vertical line x = 0, z = 64): build near the line
{
  const a = [-1, 1, 1], b = [0, 1, 2];
  for (const [bname, build] of Object.entries(BUILDS)) {
    const line = [];
    for (let d = 0; d <= 12; d += 2) {
      const e = new Map();
      build(e, -1 - d, 64 - 1 - d, 'x');
      const r = compare(a, b, e);
      total++; apSeen.add(r.ap);
      if (r.diff) { bad++; line.push(`d=${d}:${r.ap} ${r.diff}/${r.shared} ✗ ${r.ex}`); } else line.push(`${d}:${r.ap}(${r.shared})`);
    }
    console.log(`diag ${bname}: ${line.join(' ')}`);
  }
}
console.log(`${which}: ${total} configurations, ${bad} with mismatches; apron pairs seen: ${[...apSeen].join(', ')}`);
