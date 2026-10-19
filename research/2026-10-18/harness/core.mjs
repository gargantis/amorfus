// Shared core for the smoothing study: scene regions for the production
// mesher, decoding its output into a plain mesh, and mesh utilities.
// Scene coordinates == chunk-local coordinates of the chunk at [0,32)³.
import { meshRegion, DEFAULT_PARAMS } from '../lib/mesher.mjs';
export { meshRegion, DEFAULT_PARAMS };

export const CHUNK = 32;
export const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, PLANKS = 5, BRICK = 6;
export const SHARP_BIT = 256;
export const materialOf = (v) => v & 0xff;
export const isSharp = (v) => (v & SHARP_BIT) !== 0;
export const MATERIAL_NAMES = ['air', 'grass', 'dirt', 'stone', 'sand', 'planks', 'brick', 'reserved7'];

/** Mesher input for the chunk at [0,32)³ with `apron` cells of context.
 *  cellFn(x,y,z) → { v, rho?, edited? } in scene coordinates. */
export function buildRegion(cellFn, apron = 10) {
  const n = CHUNK + 2 * apron;
  const total = n * n * n;
  const blocks = new Uint16Array(total);
  const rho = new Float32Array(total);
  const shapeEdited = new Uint8Array(total);
  for (let y = 0; y < n; y++) {
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const c = cellFn(x - apron, y - apron, z - apron);
        const i = (y * n + z) * n + x;
        blocks[i] = c.v;
        rho[i] = c.rho ?? (materialOf(c.v) === AIR ? -1 : 1);
        shapeEdited[i] = c.edited ? 1 : 0;
      }
    }
  }
  return { nx: n, ny: n, nz: n, apron, blocks, rho, shapeEdited };
}

/** Region index of scene cell (x,y,z), or -1 outside the region. */
export function regionIndex(region, x, y, z) {
  const { nx, ny, nz, apron } = region;
  const rx = x + apron, ry = y + apron, rz = z + apron;
  if (rx < 0 || ry < 0 || rz < 0 || rx >= nx || ry >= ny || rz >= nz) return -1;
  return (ry * nz + rz) * nx + rx;
}

/** Decode a MeshResult (A.1 vertices, u32 indices, pick records) into a
 *  plain mesh. Positions are chunk-local blocks = scene coordinates. */
export function decodeMesh(m) {
  const V = m.vertexCount;
  const u16 = new Uint16Array(m.vertexData, 0, V * 8);
  const i16 = new Int16Array(m.vertexData, 0, V * 8);
  const u8 = new Uint8Array(m.vertexData, 0, V * 16);
  const pos = new Float64Array(V * 3);
  const nrm = new Float64Array(V * 3);
  const mat = new Uint8Array(V);
  const flags = new Uint8Array(V);
  const ao = new Float64Array(V);
  for (let v = 0; v < V; v++) {
    for (let a = 0; a < 3; a++) pos[v * 3 + a] = u16[v * 8 + a] / 256 - 0.5;
    ao[v] = u8[v * 16 + 6] / 255;
    flags[v] = u8[v * 16 + 7];
    mat[v] = u8[v * 16 + 12] & 7;
    const ox = i16[v * 8 + 4] / 32767;
    const oy = i16[v * 8 + 5] / 32767;
    let nx = ox, ny = oy, nz = 1 - Math.abs(ox) - Math.abs(oy);
    if (nz < 0) {
      const tx = (1 - Math.abs(oy)) * (ox >= 0 ? 1 : -1);
      const ty = (1 - Math.abs(ox)) * (oy >= 0 ? 1 : -1);
      nx = tx;
      ny = ty;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm[v * 3] = nx / l;
    nrm[v * 3 + 1] = ny / l;
    nrm[v * 3 + 2] = nz / l;
  }
  const quadCount = m.quadCount;
  const T = quadCount * 2;
  const tri = new Uint32Array(T * 3);
  tri.set(m.indexData.subarray(0, T * 3));
  const triQuad = new Int32Array(T);
  for (let t = 0; t < T; t++) triQuad[t] = t >> 1;
  const quadLower = new Int32Array(quadCount * 3);
  const quadAxis = new Uint8Array(quadCount);
  const quadSolidLower = new Uint8Array(quadCount);
  for (let q = 0; q < quadCount; q++) {
    const rec = m.pickRecords[q];
    const li = rec & 0x7fff;
    quadLower[q * 3] = li % 32;
    quadLower[q * 3 + 1] = Math.floor(li / 1024);
    quadLower[q * 3 + 2] = Math.floor(li / 32) % 32;
    quadAxis[q] = (rec >> 15) & 3;
    quadSolidLower[q] = (rec >> 17) & 1;
  }
  // lattice corner of each vertex (study mesher only; null otherwise)
  const corner = m.corners ? Int32Array.from(m.corners) : null;
  return { V, pos, nrm, mat, flags, ao, T, tri, triQuad, quadCount, quadLower, quadAxis, quadSolidLower, corner };
}

/** The solid block of quad q, in scene coordinates. */
export function quadSolidCell(mesh, q) {
  const x = mesh.quadLower[q * 3], y = mesh.quadLower[q * 3 + 1], z = mesh.quadLower[q * 3 + 2];
  if (mesh.quadSolidLower[q]) return [x, y, z];
  const a = mesh.quadAxis[q];
  return [x + (a === 0 ? 1 : 0), y + (a === 1 ? 1 : 0), z + (a === 2 ? 1 : 0)];
}

export function faceNormal(mesh, t, out = [0, 0, 0]) {
  const { pos, tri } = mesh;
  const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
  const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
  const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  out[0] = l > 0 ? nx / l : 0;
  out[1] = l > 0 ? ny / l : 0;
  out[2] = l > 0 ? nz / l : 0;
  out[3] = l / 2; // area
  return out;
}

export const angleDeg = (ax, ay, az, bx, by, bz) => {
  const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
  const c = Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb)));
  return (Math.acos(c) * 180) / Math.PI;
};

/** Vertex-shaded? A vertex with flag bit 1 (faceted, §7.9) or bit 0 (sharp)
 *  is shaded with its triangle's own normal. */
export const vertexIsFlat = (mesh, v) => (mesh.flags[v] & 3) !== 0;

export function stats(values) {
  const n = values.length;
  if (n === 0) return { n: 0 };
  let s = 0, s2 = 0, mx = 0;
  for (const v of values) { s += v; s2 += v * v; if (Math.abs(v) > mx) mx = Math.abs(v); }
  const mean = s / n;
  let dev2 = 0, maxDev = 0;
  for (const v of values) { const d = v - mean; dev2 += d * d; if (Math.abs(d) > maxDev) maxDev = Math.abs(d); }
  return { n, mean, std: Math.sqrt(dev2 / n), maxDev, rms: Math.sqrt(s2 / n), maxAbs: mx };
}

export function timed(fn) {
  const t0 = performance.now();
  const r = fn();
  return [r, performance.now() - t0];
}
