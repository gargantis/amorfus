// Edit scenarios on real generated terrain (seed 1,1), shared by the gh
// edit bench and checks. buildScenarios() → { name: { edits, chunks, H? } }.
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
export const SEED = [1, 1], CHUNK = 32;
const CX_MIN = -(2 ** 23) / 32, CX_SPAN = 2 ** 24 / 32, CY_MIN = -8, CY_SPAN = 24;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
const AIR = 0, STONE = 3, PLANKS = 5, BRICK = 6;

/** world solid test from generated regions (cached per chunk, apron 0) */
const genCache = new Map();
function genSolid(wx, wy, wz) {
  const cx = Math.floor(wx / CHUNK), cy = Math.floor(wy / CHUNK), cz = Math.floor(wz / CHUNK);
  const k = `${cx},${cy},${cz}`;
  let inp = genCache.get(k);
  if (!inp) { inp = buildGenMeshInput(SEED, cx, cy, cz, new Map(), { forceApron: 0 }).input; genCache.set(k, inp); }
  const x = wx - cx * CHUNK, y = wy - cy * CHUNK, z = wz - cz * CHUNK;
  return (inp.blocks[(y * CHUNK + z) * CHUNK + x] & 0xff) !== 0;
}
const topAt = (wx, wz, y0 = 63) => { for (let y = y0; y >= -32; y--) if (genSolid(wx, y, wz)) return y; return -33; };

function editSet() {
  const edits = new Map();
  const set = (wx, wy, wz, v) => {
    const cx = Math.floor(wx / CHUNK), cy = Math.floor(wy / CHUNK), cz = Math.floor(wz / CHUNK);
    const k = key(cx, cy, cz);
    if (!edits.has(k)) edits.set(k, new Map());
    edits.get(k).set(((wy - cy * CHUNK) * CHUNK + (wz - cz * CHUNK)) * CHUNK + (wx - cx * CHUNK), v);
  };
  return { edits, set };
}

// --- mountain (the round-1 edit set)
function mountain() {
  const { edits, set } = editSet();
  const C = [-1, 1, 1], X0 = C[0] * CHUNK, Z0 = C[2] * CHUNK;
  const top = (x, z) => topAt(x, z);
  for (let x = X0 + 12; x < X0 + 32; x++) for (let z = Z0 + 2; z < Z0 + 7; z++) {
    const h = 45 + (X0 + 31.5 - (x + 0.5)) / 4;
    for (let y = Math.floor(h); y <= top(x, z); y++) if (y + 0.5 >= h && genSolid(x, y, z)) set(x, y, z, AIR);
    for (let y = top(x, z) + 1; y + 0.5 < h; y++) set(x, y, z, STONE);
  }
  { const cx = X0 + 22.3, cz = Z0 + 14.2, cy = top(X0 + 22, Z0 + 14) + 0.5;
    for (let x = X0 + 15; x < X0 + 30; x++) for (let z = Z0 + 8; z < Z0 + 21; z++) for (let y = Math.floor(cy) - 6; y < cy + 6; y++)
      if (!genSolid(x, y, z) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) < 5) set(x, y, z, STONE); }
  { const cx = X0 + 6.4, cz = Z0 + 22.1, cy = top(X0 + 6, Z0 + 22) + 0.7;
    for (let x = X0; x < X0 + 14; x++) for (let z = Z0 + 15; z < Z0 + 30; z++) for (let y = Math.floor(cy) - 5; y <= Math.floor(cy) + 3; y++)
      if (genSolid(x, y, z) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) < 4) set(x, y, z, AIR); }
  { const H = top(X0 + 21, Z0 + 26);
    for (let x = X0 + 16; x < X0 + 26; x++) for (let z = Z0 + 22; z < Z0 + 31; z++) {
      for (let y = H + 1; y <= top(x, z); y++) set(x, y, z, AIR);
      for (let y = top(x, z) + 1; y <= H; y++) set(x, y, z, STONE);
    }
    for (let z = Z0 + 22; z < Z0 + 31; z++) for (let y = H + 1; y <= H + 3; y++) set(X0 + 25, y, z, BRICK); }
  return { edits, chunks: [C] };
}
// --- single placed block
function single() {
  const { edits, set } = editSet();
  const x = 32 + 14, z = 13;
  set(x, topAt(x, z) + 1, z, STONE);
  return { edits, chunks: [[1, 0, 0]] };
}
// --- dense town
function town() {
  const { edits, set } = editSet();
  const X0 = 32, Z0 = 0, H = 16;
  for (let x = X0 + 2; x < X0 + 30; x++) for (let z = Z0 + 2; z < Z0 + 30; z++) {
    const t = topAt(x, z);
    for (let y = H + 1; y <= t; y++) set(x, y, z, AIR);
    for (let y = t + 1; y <= H; y++) set(x, y, z, STONE);
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const hx = X0 + 4 + 9 * i, hz = Z0 + 4 + 9 * j;
    for (let x = hx; x < hx + 5; x++) for (let z = hz; z < hz + 5; z++) for (let y = H + 1; y <= H + 5; y++) {
      const wall = x === hx || x === hx + 4 || z === hz || z === hz + 4;
      const roof = y === H + 5;
      const door = z === hz && x === hx + 2 && (y === H + 1 || y === H + 2);
      if ((wall || roof) && !door) set(x, y, z, (i + j) % 2 ? PLANKS : BRICK);
    }
    // 1:2 stairs up the side of every house to its roof
    for (let k = 0; k < 8; k++) for (let y = H + 1; y <= H + 1 + Math.floor(k / 2); y++) set(hx + 5, y, hz + 4 - (k >> 1), STONE);
  }
  return { edits, chunks: [[1, 0, 0]] };
}
// --- corner edit: a house centred on the corner x = z = 32
function corner() {
  const { edits, set } = editSet();
  const H = topAt(32, 32);
  for (let x = 29; x < 35; x++) for (let z = 29; z < 35; z++) for (let y = H + 1; y <= H + 4; y++) {
    const wall = x === 29 || x === 34 || z === 29 || z === 34;
    if (wall || y === H + 4) set(x, y, z, PLANKS);
  }
  // the 4 column chunks × the 2 nearest chunk layers (an edit near a chunk
  // corner in all three axes dirties 8)
  const cyA = Math.floor((H + 2) / CHUNK);
  const cyB = (H + 2) - CHUNK * cyA < 16 ? cyA - 1 : cyA + 1;
  const chunks = [];
  for (const cy of [cyA, cyB]) for (const cz of [0, 1]) for (const cx of [0, 1]) chunks.push([cx, cy, cz]);
  return { edits, chunks, H };
}


export function buildScenarios() {
  return { mountain: mountain(), single: single(), town: town(), 'corner×8': corner() };
}
export function scenarioInputs(sc, apron) {
  return sc.chunks.map((c) => buildGenMeshInput(SEED, c[0], c[1], c[2], sc.edits, { forceApron: apron }).input);
}
