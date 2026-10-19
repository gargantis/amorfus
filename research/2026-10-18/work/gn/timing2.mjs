// Realistic edited chunks: cost of gn-best vs hints, zone vertex counts, and
// the GEN_MESH generation time for scale.
import { meshRegion as gn } from './mesher-gn.mjs';
import { meshRegion as repo } from '../../lib/mesher-repo.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
const CX_MIN = -(2 ** 18), CX_SPAN = 2 ** 19, CY_MIN = -8, CY_SPAN = 24;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
const C = [-1, 1, 1];
// surface height of the chunk column from a GEN_MESH region
const probe = buildGenMeshInput([1, 1], ...C, new Map(), { forceApron: 3 }).input;
const surf = (lx, lz) => { for (let y = probe.ny - 1; y >= 0; y--) { const i = (y * probe.nz + (lz + 3)) * probe.nx + (lx + 3); if ((probe.blocks[i] & 255) !== 0) return C[1] * 32 + y - 3 + 1; } return null; };
function withEdits(fn) {
  const edits = new Map();
  const set = (wx, wy, wz, v) => {
    const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32), cz = Math.floor(wz / 32);
    const k = key(cx, cy, cz);
    if (!edits.has(k)) edits.set(k, new Map());
    edits.get(k).set(((wy - cy * 32) * 32 + (wz - cz * 32)) * 32 + (wx - cx * 32), v);
  };
  fn(set);
  return buildGenMeshInput([1, 1], ...C, edits, {}).input;
}
const bx = C[0] * 32, bz = C[2] * 32;
const scenarios = {
  'one placed block': withEdits((set) => { const h = surf(16, 16); set(bx + 16, h, bz + 16, 3); }),
  'built mound 10x5x10 + 10-long trench': withEdits((set) => {
    for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) {
      const h = surf(8 + x, 8 + z); const r = Math.hypot(x - 4.5, z - 4.5);
      for (let y = 0; y < 5 - r * 0.9; y++) set(bx + 8 + x, h + y, bz + 8 + z, 3);
    }
    for (let x = 0; x < 10; x++) { const h = surf(4 + x, 24); for (let y = 1; y <= 2; y++) set(bx + 4 + x, h - y, bz + 24, 0); }
  }),
  'hollow house 16x8x16 (1-thick walls, planks)': withEdits((set) => {
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const h = surf(8 + x, 8 + z);
      for (let y = 0; y < 8; y++) {
        const wall = x === 0 || x === 15 || z === 0 || z === 15 || y === 7;
        set(bx + 8 + x, h + y, bz + 8 + z, wall ? 5 : 0);
      }
    }
  }),
};
for (const [label, inp] of Object.entries(scenarios)) {
  const tA = [], tB = [];
  for (let r = 0; r < 25; r++) {
    let t0 = performance.now(); repo(inp); const a = performance.now() - t0;
    t0 = performance.now(); const m = gn({ ...inp, params: PARAMS }); const b = performance.now() - t0;
    tA.push(a); tB.push(b);
  }
  // zone vertices: emitted vertices whose normal differs from gn with area normals
  const m1 = gn({ ...inp, params: PARAMS });
  const m0 = gn({ ...inp, params: { ...PARAMS, normalRule: 'area', fastShade: false } });
  const i1 = new Int16Array(m1.vertexData), i0 = new Int16Array(m0.vertexData);
  let zone = 0;
  for (let v = 0; v < m1.vertexCount; v++) if (i1[v * 8 + 4] !== i0[v * 8 + 4] || i1[v * 8 + 5] !== i0[v * 8 + 5]) zone++;
  const med = (x) => Math.min(...x); // min-of-25
  console.log(`${label}: apron ${inp.apron}, ${m1.vertexCount} vertices (${zone} with edit-zone normals); hints ${med(tA).toFixed(1)} ms, gn-best ${med(tB).toFixed(1)} ms (+${(med(tB) - med(tA)).toFixed(1)}) [min of 25]`);
}
for (const ap of [3, 10]) {
  const t = [];
  for (let r = 0; r < 6; r++) { const t0 = performance.now(); buildGenMeshInput([1, 1], ...C, new Map(), { forceApron: ap }); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  console.log(`generation (buildGenMeshInput) apron ${ap}: median ${t[3].toFixed(1)} ms`);
}
