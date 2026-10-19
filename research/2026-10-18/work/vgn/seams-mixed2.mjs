// vgn: mixed-apron seams, part 2 — vertical (y) pairs where the terrain
// crosses the border, plus a count of shared border vertices that took the
// gn edit-zone (ring) normal path, so the test is known to exercise it.
//   node work/vgn/seams-mixed2.mjs
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion } from '../gn/mesher-gn.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { setBlock } from './util.mjs';
const seed = [1, 1];
const PLANKS = 5, AIR = 0, BRICK = 6, SHARP = 256;
const AREA = { ...PARAMS, normalRule: 'area', fastShade: false };
function verts(c, edits, params) {
  const { input, apron } = buildGenMeshInput(seed, c[0], c[1], c[2], edits, {});
  const m = meshRegion({ ...input, params });
  const u8 = new Uint8Array(m.vertexData);
  const map = new Map();
  for (let v = 0; v < m.vertexCount; v++) {
    const wc = [c[0] * 32 + m.corners[v * 3], c[1] * 32 + m.corners[v * 3 + 1], c[2] * 32 + m.corners[v * 3 + 2]];
    const flags = u8[v * 16 + 7], mat = u8[v * 16 + 12];
    let k = `${wc},${mat},${flags & 1}`;
    if (flags & 1) k += `,${u8.subarray(v * 16 + 8, v * 16 + 12)}`;
    const u16 = new Uint16Array(m.vertexData, v * 16, 3);
    map.set(k, `${c[0] * 8192 + u16[0]},${c[1] * 8192 + u16[1]},${c[2] * 8192 + u16[2]}|${u8.subarray(v * 16 + 6, v * 16 + 12)}`);
  }
  return { map, apron };
}
function compare(a, b, edits) {
  const A = verts(a, edits, PARAMS), B = verts(b, edits, PARAMS), A0 = verts(a, edits, AREA);
  let shared = 0, diff = 0, zone = 0;
  for (const [k, va] of A.map) { const vb = B.map.get(k); if (vb === undefined) continue; shared++; if (vb !== va) diff++; if (A0.map.get(k) !== va) zone++; }
  return { shared, diff, zone, ap: `${A.apron}/${B.apron}` };
}
const blocksCache = new Map();
function topAt(wx, wz) {
  for (let cy = 3; cy >= -1; cy--) {
    const k = `${Math.floor(wx / 32)},${cy},${Math.floor(wz / 32)}`;
    let inp = blocksCache.get(k);
    if (!inp) { inp = buildGenMeshInput(seed, Math.floor(wx / 32), cy, Math.floor(wz / 32), new Map(), { forceApron: 0 }).input; blocksCache.set(k, inp); }
    const lx = wx - Math.floor(wx / 32) * 32, lz = wz - Math.floor(wz / 32) * 32;
    for (let y = 31; y >= 0; y--) if ((inp.blocks[(y * 32 + lz) * 32 + lx] & 0xff) !== 0) return cy * 32 + y;
  }
}
let total = 0, bad = 0, zoneTotal = 0;
for (const [a, b] of [[[-2, 1, 1], [-2, 2, 1]], [[-1, 1, 1], [-1, 2, 1]], [[-3, 0, -1], [-3, 1, -1]]]) {
  const by = b[1] * 32;
  // columns of chunk a where the surface top is within 2 of the border
  const cols = [];
  for (let x = a[0] * 32; x < a[0] * 32 + 32; x++) for (let z = a[2] * 32; z < a[2] * 32 + 32; z++) { const t = topAt(x, z); if (Math.abs(t - (by - 1)) <= 2) cols.push([x, z, t]); }
  const base = compare(a, b, new Map());
  console.log(`y pair ${a}|${b}: ${cols.length} columns with the surface within 2 of y=${by}; unedited ${base.ap} shared ${base.shared} diff ${base.diff}`);
  if (!cols.length) continue;
  const pickCols = cols.filter((_, i) => i % Math.max(1, Math.floor(cols.length / 4)) === 0).slice(0, 4);
  for (const [x, z, t] of pickCols) {
    for (const [name, f] of [
      ['wall', (e) => { for (let dz = 0; dz < 4; dz++) { const tt = topAt(x, z + dz); for (let h = 1; h <= 3; h++) setBlock(e, x, tt + h, z + dz, PLANKS); } }],
      ['dig', (e) => { for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) { const tt = topAt(x + dx, z + dz); for (let h = 0; h < 2; h++) setBlock(e, x + dx, tt - h, z + dz, AIR); } }],
      ['post+sharp', (e) => { setBlock(e, x, t + 1, z, PLANKS); setBlock(e, x, t + 2, z, PLANKS); setBlock(e, x + 1, topAt(x + 1, z) + 1, z, BRICK | SHARP); }],
      ['far wall (dy 11)', (e) => { for (let dz = 0; dz < 4; dz++) setBlock(e, x, by - 12, z + dz, PLANKS); }],
    ]) {
      const e = new Map(); f(e);
      const r = compare(a, b, e);
      total++; zoneTotal += r.zone;
      if (r.diff) bad++;
      console.log(`   ${name} at ${x},${t},${z}: aprons ${r.ap}, shared ${r.shared}, on the ring path ${r.zone}, mismatched ${r.diff}`);
    }
  }
}
// x pair with the zone count, edit at d = 0..3 (zone reaches the border)
for (const d of [0, 1, 2, 3]) {
  const a = [-2, 1, 1], b = [-1, 1, 1];
  const x = -32 - 1 - d;
  const e = new Map();
  for (let dz = 0; dz < 12; dz++) { const tt = topAt(x, 40 + dz); for (let h = 1; h <= 3; h++) setBlock(e, x, tt + h, 40 + dz, PLANKS); }
  const r = compare(a, b, e);
  total++; zoneTotal += r.zone; if (r.diff) bad++;
  console.log(`x pair, 12-long fence at distance ${d} from the border: aprons ${r.ap}, shared ${r.shared}, ring path ${r.zone}, mismatched ${r.diff}`);
}
console.log(`${total} configurations, ${bad} with mismatches, ${zoneTotal} shared vertices on the ring path in total`);
