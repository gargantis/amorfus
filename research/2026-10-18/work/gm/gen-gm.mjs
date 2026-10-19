// gm — terrain generator v1 (src/core/gen/v1/index.ts, read-only copy) with
// MATERIAL HINTS: the continuous fields the v1 material rule thresholds,
// emitted next to the occupancy hints. The original outputs (blocks, hints)
// are computed by the same statements in the same order, so they stay
// byte-identical (checked by work/gm/check-gen.mjs against lib/gen-mesh.mjs).
//
// v1 material rule (index.ts lines 241–249), verified in the code:
//   solid ⇔ d > 0, d = min(dTerrain, cave term where wy < H − 4)
//   dTerrain = H − wy (+ 8·fbm3d where |H − wy| < 24)
//   top  (dTerrain ≤ 1): SAND if H ≤ SEA_LEVEL + 2, else GRASS
//   dirt (1 < dTerrain ≤ 4)
//   stone (dTerrain > 4)
// So two fields decide every generated material:
//   S(x,z)   = SEA_LEVEL + 2 − H(x,z)   per COLUMN   (sand ⇔ S ≥ 0)
//   D(x,y,z) = dTerrain                 per BLOCK    (top ≤ 1 < dirt ≤ 4 < stone)
// Both are pure functions of (seed, generatorVersion, cell) computed with
// the exact-ops allowlist (they are intermediate values the generator
// already computes), so they are seam-safe like the hints.
//
// Quantised planes (what a production GEN_MESH would emit/keep):
//   sQ: Int16 per column, S at 1/256 H-units, clamped to ±127 (2 B/column)
//   dQ: Int8 per block, D at 1/16 block, clamped to [−8, +7.9375]
//       (covers both thresholds 1 and 4 with margin; 1 B/block)
import FastNoiseLite from '../../../../src/core/gen/v1/vendor/FastNoiseLite.js';

export const GENERATOR_VERSION = 1;
export const BAND_MIN = -64;
export const BAND_MAX = 160;
export const HINT_SCALE = 4;
export const SEA_LEVEL = 0;
const CAVE_K = 32;
const CAVE_THRESHOLD = 0.06;
const CAVE_MASK_MIN = 0.4;
const LATTICE = 4;
const CHUNK = 32;

export const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4;

// ---- random.ts (copy)
function splitmix32(state) {
  let z = (state + 0x9e3779b9) | 0;
  z ^= z >>> 16;
  z = Math.imul(z, 0x21f0aaad);
  z ^= z >>> 15;
  z = Math.imul(z, 0x735a2d97);
  z ^= z >>> 15;
  return z | 0;
}
function subSeeds(seed, count) {
  let s = (seed[0] ^ Math.imul(seed[1] | 0, 0x9e3779b1)) | 0;
  const out = [];
  for (let i = 0; i < count; i++) { s = splitmix32(s); out.push(s); }
  return out;
}

const noiseCache = new Map();
function noises(seed) {
  const key = `${seed[0]}:${seed[1]}`;
  const cached = noiseCache.get(key);
  if (cached !== undefined) return cached;
  const [s1, s2, s3, s4, s5, s6] = subSeeds(seed, 6);
  const cont = new FastNoiseLite(s1);
  cont.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  cont.SetFrequency(1 / 1024);
  const fbm2d = new FastNoiseLite(s2);
  fbm2d.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  fbm2d.SetFractalType(FastNoiseLite.FractalType.FBm);
  fbm2d.SetFractalOctaves(4);
  fbm2d.SetFrequency(1 / 256);
  const ridged = new FastNoiseLite(s3);
  ridged.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  ridged.SetFractalType(FastNoiseLite.FractalType.Ridged);
  ridged.SetFractalOctaves(3);
  ridged.SetFrequency(1 / 512);
  const fbm3d = new FastNoiseLite(s4);
  fbm3d.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  fbm3d.SetFractalType(FastNoiseLite.FractalType.FBm);
  fbm3d.SetFractalOctaves(2);
  fbm3d.SetFrequency(1);
  const cave = new FastNoiseLite(s5);
  cave.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  cave.SetFrequency(1);
  const caveMask = new FastNoiseLite(s6);
  caveMask.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  caveMask.SetFrequency(1);
  const set = { cont, fbm2d, ridged, fbm3d, cave, caveMask };
  noiseCache.set(key, set);
  return set;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function heightAt(seed, x, z) {
  const n = noises(seed);
  const c = n.cont.GetNoise(x, z);
  const f = n.fbm2d.GetNoise(x, z);
  const r = n.ridged.GetNoise(x, z);
  return 32 + 48 * c + 24 * f + 16 * r * clamp(c, 0, 1);
}

class LatticeField {
  constructor(sample, x0, y0, z0, nx, ny, nz) {
    this.lx0 = Math.floor(x0 / LATTICE);
    this.ly0 = Math.floor(y0 / LATTICE);
    this.lz0 = Math.floor(z0 / LATTICE);
    const lx1 = Math.floor((x0 + nx - 1) / LATTICE) + 1;
    const ly1 = Math.floor((y0 + ny - 1) / LATTICE) + 1;
    const lz1 = Math.floor((z0 + nz - 1) / LATTICE) + 1;
    this.lnx = lx1 - this.lx0 + 1;
    this.lnz = lz1 - this.lz0 + 1;
    const lny = ly1 - this.ly0 + 1;
    this.values = new Float64Array(this.lnx * lny * this.lnz);
    let i = 0;
    for (let ly = this.ly0; ly <= ly1; ly++)
      for (let lz = this.lz0; lz <= lz1; lz++)
        for (let lx = this.lx0; lx <= lx1; lx++) this.values[i++] = sample(lx * LATTICE, ly * LATTICE, lz * LATTICE);
  }
  at(x, y, z) {
    const fx = x / LATTICE - this.lx0, fy = y / LATTICE - this.ly0, fz = z / LATTICE - this.lz0;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const sxz = this.lnx * this.lnz;
    const base = iy * sxz + iz * this.lnx + ix;
    const v = this.values;
    const c000 = v[base], c100 = v[base + 1], c010 = v[base + this.lnx], c110 = v[base + this.lnx + 1];
    const c001 = v[base + sxz], c101 = v[base + sxz + 1], c011 = v[base + sxz + this.lnx], c111 = v[base + sxz + this.lnx + 1];
    const x00 = c000 + (c100 - c000) * tx;
    const x10 = c010 + (c110 - c010) * tx;
    const x01 = c001 + (c101 - c001) * tx;
    const x11 = c011 + (c111 - c011) * tx;
    const y0v = x00 + (x10 - x00) * tz;
    const y1v = x01 + (x11 - x01) * tz;
    return y0v + (y1v - y0v) * ty;
  }
}

/** Quantisers for the production planes (exact ops only). */
export const S_SCALE = 256; // sQ = round(S·256) clamped to Int16 range of ±127 H-units
export const D_SCALE = 16; // dQ = round(D·16) clamped to Int8
export const qS = (S) => Math.round(S_SCALE * clamp(S, -127, 127));
export const qD = (D) => Math.round(clamp(D * D_SCALE, -128, 127));
/** Fine plane: D at 1/256 block in Int16 (range ±127). */
export const D16_SCALE = 256;
export const qD16 = (D) => Math.round(D16_SCALE * clamp(D, -127, 127));

/** v1 generateRegion + material hints. Same loop, same statements; extra
 *  outputs: H (per column, f64), D (per block, f64 dTerrain), sQ, dQ. */
export function generateRegionGM(seed, x0, y0, z0, nx, ny, nz) {
  const n = noises(seed);
  const blocks = new Uint16Array(nx * ny * nz);
  const hints = new Int8Array(nx * ny * nz);
  const D = new Float64Array(nx * ny * nz);
  const dQ = new Int8Array(nx * ny * nz);
  const dQ16 = new Int16Array(nx * ny * nz);
  const fbm3d = new LatticeField((x, y, z) => n.fbm3d.GetNoise(x / 48, y / 32, z / 48), x0, y0, z0, nx, ny, nz);
  const cave = new LatticeField((x, y, z) => n.cave.GetNoise(x / 40, y / 24, z / 40), x0, y0, z0, nx, ny, nz);
  const caveMask = new LatticeField((x, y, z) => n.caveMask.GetNoise(x / 320, y / 160, z / 320), x0, y0, z0, nx, ny, nz);
  const heights = new Float64Array(nx * nz);
  const sQ = new Int16Array(nx * nz);
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const H = heightAt(seed, x0 + x, z0 + z);
      heights[z * nx + x] = H;
      sQ[z * nx + x] = qS(SEA_LEVEL + 2 - H);
    }
  }
  for (let y = 0; y < ny; y++) {
    const wy = y0 + y;
    for (let z = 0; z < nz; z++) {
      const h2 = z * nx;
      for (let x = 0; x < nx; x++) {
        const i = (y * nz + z) * nx + x;
        if (wy < BAND_MIN) { blocks[i] = STONE; hints[i] = 127; D[i] = 64; dQ[i] = 127; dQ16[i] = qD16(64); continue; }
        if (wy >= BAND_MAX) { blocks[i] = AIR; hints[i] = -127; D[i] = -64; dQ[i] = -128; dQ16[i] = qD16(-64); continue; }
        const wx = x0 + x, wz = z0 + z;
        const H = heights[h2 + x];
        let dTerrain = H - wy;
        if (Math.abs(dTerrain) < 24) dTerrain += 8 * fbm3d.at(wx, wy, wz);
        let d = dTerrain;
        if (wy < H - 4 && caveMask.at(wx, wy, wz) > CAVE_MASK_MIN) {
          d = Math.min(d, CAVE_K * (Math.abs(cave.at(wx, wy, wz)) - CAVE_THRESHOLD));
        }
        const solid = d > 0;
        const q = Math.round(127 * clamp(d / HINT_SCALE, -1, 1));
        hints[i] = solid ? Math.max(1, q) : Math.min(-1, q);
        D[i] = dTerrain;
        dQ[i] = qD(dTerrain);
        dQ16[i] = qD16(dTerrain);
        if (!solid) blocks[i] = AIR;
        else if (dTerrain <= 1) blocks[i] = H <= SEA_LEVEL + 2 ? SAND : GRASS;
        else if (dTerrain <= 4) blocks[i] = DIRT;
        else blocks[i] = STONE;
      }
    }
  }
  return { x0, y0, z0, nx, ny, nz, blocks, hints, H: heights, D, sQ, dQ, dQ16 };
}

/** The v1 material rule as a function of the two fields (block centre). */
export function v1Material(S, Dv) {
  if (Dv <= 1) return S >= 0 ? SAND : GRASS;
  if (Dv <= 4) return DIRT;
  return STONE;
}
export { CHUNK };

/** v1 generateRegion WITHOUT the material planes (timing reference: the same
 *  statements as src/core/gen/v1/index.ts). */
export function generateRegionV1(seed, x0, y0, z0, nx, ny, nz) {
  const n = noises(seed);
  const blocks = new Uint16Array(nx * ny * nz);
  const hints = new Int8Array(nx * ny * nz);
  const fbm3d = new LatticeField((x, y, z) => n.fbm3d.GetNoise(x / 48, y / 32, z / 48), x0, y0, z0, nx, ny, nz);
  const cave = new LatticeField((x, y, z) => n.cave.GetNoise(x / 40, y / 24, z / 40), x0, y0, z0, nx, ny, nz);
  const caveMask = new LatticeField((x, y, z) => n.caveMask.GetNoise(x / 320, y / 160, z / 320), x0, y0, z0, nx, ny, nz);
  const heights = new Float64Array(nx * nz);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) heights[z * nx + x] = heightAt(seed, x0 + x, z0 + z);
  for (let y = 0; y < ny; y++) {
    const wy = y0 + y;
    for (let z = 0; z < nz; z++) {
      const h2 = z * nx;
      for (let x = 0; x < nx; x++) {
        const i = (y * nz + z) * nx + x;
        if (wy < BAND_MIN) { blocks[i] = STONE; hints[i] = 127; continue; }
        if (wy >= BAND_MAX) { blocks[i] = AIR; hints[i] = -127; continue; }
        const wx = x0 + x, wz = z0 + z;
        const H = heights[h2 + x];
        let dTerrain = H - wy;
        if (Math.abs(dTerrain) < 24) dTerrain += 8 * fbm3d.at(wx, wy, wz);
        let d = dTerrain;
        if (wy < H - 4 && caveMask.at(wx, wy, wz) > CAVE_MASK_MIN) d = Math.min(d, CAVE_K * (Math.abs(cave.at(wx, wy, wz)) - CAVE_THRESHOLD));
        const solid = d > 0;
        const q = Math.round(127 * clamp(d / HINT_SCALE, -1, 1));
        hints[i] = solid ? Math.max(1, q) : Math.min(-1, q);
        if (!solid) blocks[i] = AIR;
        else if (dTerrain <= 1) blocks[i] = H <= SEA_LEVEL + 2 ? SAND : GRASS;
        else if (dTerrain <= 4) blocks[i] = DIRT;
        else blocks[i] = STONE;
      }
    }
  }
  return { blocks, hints };
}
/** v1 + ONLY the planes gm-hint needs (sQ per column, dQ Int8 per block). */
export function generateRegionHint(seed, x0, y0, z0, nx, ny, nz) {
  const n = noises(seed);
  const blocks = new Uint16Array(nx * ny * nz);
  const hints = new Int8Array(nx * ny * nz);
  const dQ = new Int8Array(nx * ny * nz);
  const fbm3d = new LatticeField((x, y, z) => n.fbm3d.GetNoise(x / 48, y / 32, z / 48), x0, y0, z0, nx, ny, nz);
  const cave = new LatticeField((x, y, z) => n.cave.GetNoise(x / 40, y / 24, z / 40), x0, y0, z0, nx, ny, nz);
  const caveMask = new LatticeField((x, y, z) => n.caveMask.GetNoise(x / 320, y / 160, z / 320), x0, y0, z0, nx, ny, nz);
  const heights = new Float64Array(nx * nz);
  const sQ = new Int16Array(nx * nz);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) { const H = heightAt(seed, x0 + x, z0 + z); heights[z * nx + x] = H; sQ[z * nx + x] = qS(SEA_LEVEL + 2 - H); }
  for (let y = 0; y < ny; y++) {
    const wy = y0 + y;
    for (let z = 0; z < nz; z++) {
      const h2 = z * nx;
      for (let x = 0; x < nx; x++) {
        const i = (y * nz + z) * nx + x;
        if (wy < BAND_MIN) { blocks[i] = STONE; hints[i] = 127; dQ[i] = 127; continue; }
        if (wy >= BAND_MAX) { blocks[i] = AIR; hints[i] = -127; dQ[i] = -128; continue; }
        const wx = x0 + x, wz = z0 + z;
        const H = heights[h2 + x];
        let dTerrain = H - wy;
        if (Math.abs(dTerrain) < 24) dTerrain += 8 * fbm3d.at(wx, wy, wz);
        let d = dTerrain;
        if (wy < H - 4 && caveMask.at(wx, wy, wz) > CAVE_MASK_MIN) d = Math.min(d, CAVE_K * (Math.abs(cave.at(wx, wy, wz)) - CAVE_THRESHOLD));
        const solid = d > 0;
        const q = Math.round(127 * clamp(d / HINT_SCALE, -1, 1));
        hints[i] = solid ? Math.max(1, q) : Math.min(-1, q);
        dQ[i] = qD(dTerrain);
        if (!solid) blocks[i] = AIR;
        else if (dTerrain <= 1) blocks[i] = H <= SEA_LEVEL + 2 ? SAND : GRASS;
        else if (dTerrain <= 4) blocks[i] = DIRT;
        else blocks[i] = STONE;
      }
    }
  }
  return { blocks, hints, sQ, dQ };
}
