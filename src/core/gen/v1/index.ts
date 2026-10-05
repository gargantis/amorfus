// Terrain generator v1 (§6.4): CPU, float64, exact-ops allowlist only,
// frozen at the first public release (D-24). Occupancy and hints are pure
// functions of (seed, generatorVersion, cell); nothing here may depend on
// region origin — 3D noise is sampled on a WORLD-ALIGNED 4-block lattice,
// so any partition of space generates identical bytes (apron contract).
import FastNoiseLite from './vendor/FastNoiseLite.js';
import { subSeeds } from './random';
import { CHUNK } from '../../world/coords';
import { AIR, makeBlock, MATERIALS } from '../../world/block';

export const GENERATOR_VERSION = 1;

/** 3D band (v1 protocol constants): below it uniform stone, above it air. */
export const BAND_MIN = -64;
export const BAND_MAX = 160;

/** Hint quantisation scale, frozen and covered by the golden hashes. */
export const HINT_SCALE = 4;

const SEA_LEVEL = 0;
const CAVE_K = 32;
const CAVE_THRESHOLD = 0.06;
const CAVE_MASK_MIN = 0.4;
const LATTICE = 4;

const STONE = makeBlock(MATERIALS.indexOf('stone'), false);
const GRASS = makeBlock(MATERIALS.indexOf('grass'), false);
const DIRT = makeBlock(MATERIALS.indexOf('dirt'), false);
const SAND = makeBlock(MATERIALS.indexOf('sand'), false);

interface NoiseSet {
  cont: FastNoiseLite;
  fbm2d: FastNoiseLite;
  ridged: FastNoiseLite;
  fbm3d: FastNoiseLite;
  cave: FastNoiseLite;
  caveMask: FastNoiseLite;
}

const noiseCache = new Map<string, NoiseSet>();

function noises(seed: readonly [number, number]): NoiseSet {
  const key = `${seed[0]}:${seed[1]}`;
  const cached = noiseCache.get(key);
  if (cached !== undefined) return cached;
  const [s1, s2, s3, s4, s5, s6] = subSeeds(seed, 6) as [number, number, number, number, number, number];

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
  fbm3d.SetFrequency(1); // coordinates arrive pre-scaled (x/48, y/32, z/48)

  const cave = new FastNoiseLite(s5);
  cave.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  cave.SetFrequency(1); // pre-scaled (x/40, y/24, z/40)

  // Cave REGIONS: a low-frequency mask keeps most of the underground
  // cave-free, or the tunnel honeycomb's surface area swamps the §14
  // triangle budget (measured: 5.4 M tris at R=192 without it).
  const caveMask = new FastNoiseLite(s6);
  caveMask.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  caveMask.SetFrequency(1); // pre-scaled (x/320, y/160, z/320)

  const set = { cont, fbm2d, ridged, fbm3d, cave, caveMask };
  noiseCache.set(key, set);
  return set;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** H(x,z): bounded inside (−56, 152) by construction; a golden property
 *  test samples and asserts the bound. */
export function heightAt(seed: readonly [number, number], x: number, z: number): number {
  const n = noises(seed);
  const c = n.cont.GetNoise(x, z);
  const f = n.fbm2d.GetNoise(x, z);
  const r = n.ridged.GetNoise(x, z);
  return 32 + 48 * c + 24 * f + 16 * r * clamp(c, 0, 1);
}

export interface Region {
  x0: number;
  y0: number;
  z0: number;
  nx: number;
  ny: number;
  nz: number;
  /** layout: (y·nz + z)·nx + x, region-local (matches A.2 for a chunk) */
  blocks: Uint16Array;
  hints: Int8Array;
}

/** Storage kind and hint state are independent (§6.2): a uniform deep
 *  chunk is 'saturated', while a uniform air chunk just above a surface
 *  still carries a hint plane. */
export interface ChunkGen {
  storage: { kind: 'uniform'; value: number } | { kind: 'dense'; blocks: Uint16Array };
  hints: Int8Array | 'saturated';
}

/** Trilinear-interpolated lattice sampler over a world-aligned 4-grid. */
class LatticeField {
  private values: Float64Array;
  private lx0: number;
  private ly0: number;
  private lz0: number;
  private lnx: number;
  private lnz: number;

  constructor(
    sample: (x: number, y: number, z: number) => number,
    x0: number, y0: number, z0: number, nx: number, ny: number, nz: number,
  ) {
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
    for (let ly = this.ly0; ly <= ly1; ly++) {
      for (let lz = this.lz0; lz <= lz1; lz++) {
        for (let lx = this.lx0; lx <= lx1; lx++) {
          this.values[i++] = sample(lx * LATTICE, ly * LATTICE, lz * LATTICE);
        }
      }
    }
  }

  at(x: number, y: number, z: number): number {
    const fx = x / LATTICE - this.lx0;
    const fy = y / LATTICE - this.ly0;
    const fz = z / LATTICE - this.lz0;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const ty = fy - iy;
    const tz = fz - iz;
    const sxz = this.lnx * this.lnz;
    const base = iy * sxz + iz * this.lnx + ix;
    const v = this.values;
    const c000 = v[base]!;
    const c100 = v[base + 1]!;
    const c010 = v[base + this.lnx]!;
    const c110 = v[base + this.lnx + 1]!;
    const c001 = v[base + sxz]!;
    const c101 = v[base + sxz + 1]!;
    const c011 = v[base + sxz + this.lnx]!;
    const c111 = v[base + sxz + this.lnx + 1]!;
    const x00 = c000 + (c100 - c000) * tx;
    const x10 = c010 + (c110 - c010) * tx;
    const x01 = c001 + (c101 - c001) * tx;
    const x11 = c011 + (c111 - c011) * tx;
    const y0v = x00 + (x10 - x00) * tz;
    const y1v = x01 + (x11 - x01) * tz;
    return y0v + (y1v - y0v) * ty;
  }
}

export function generateRegion(
  seed: readonly [number, number],
  x0: number, y0: number, z0: number,
  nx: number, ny: number, nz: number,
): Region {
  const n = noises(seed);
  const blocks = new Uint16Array(nx * ny * nz);
  const hints = new Int8Array(nx * ny * nz);

  const fbm3d = new LatticeField(
    (x, y, z) => n.fbm3d.GetNoise(x / 48, y / 32, z / 48),
    x0, y0, z0, nx, ny, nz,
  );
  const cave = new LatticeField(
    (x, y, z) => n.cave.GetNoise(x / 40, y / 24, z / 40),
    x0, y0, z0, nx, ny, nz,
  );
  const caveMask = new LatticeField(
    (x, y, z) => n.caveMask.GetNoise(x / 320, y / 160, z / 320),
    x0, y0, z0, nx, ny, nz,
  );

  const heights = new Float64Array(nx * nz);
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      heights[z * nx + x] = heightAt(seed, x0 + x, z0 + z);
    }
  }

  for (let y = 0; y < ny; y++) {
    const wy = y0 + y;
    for (let z = 0; z < nz; z++) {
      const h2 = z * nx;
      for (let x = 0; x < nx; x++) {
        const i = (y * nz + z) * nx + x;
        if (wy < BAND_MIN) {
          blocks[i] = STONE;
          hints[i] = 127;
          continue;
        }
        if (wy >= BAND_MAX) {
          blocks[i] = AIR;
          hints[i] = -127;
          continue;
        }
        const wx = x0 + x;
        const wz = z0 + z;
        const H = heights[h2 + x]!;
        // dTerrain: signed distance-ish to the noise-shifted terrain
        // surface; material depth follows it, not bare H.
        let dTerrain = H - wy;
        if (Math.abs(dTerrain) < 24) dTerrain += 8 * fbm3d.at(wx, wy, wz);
        let d = dTerrain;
        if (wy < H - 4 && caveMask.at(wx, wy, wz) > CAVE_MASK_MIN) {
          d = Math.min(d, CAVE_K * (Math.abs(cave.at(wx, wy, wz)) - CAVE_THRESHOLD));
        }
        const solid = d > 0;
        const q = Math.round(127 * clamp(d / HINT_SCALE, -1, 1));
        hints[i] = solid ? Math.max(1, q) : Math.min(-1, q);
        if (!solid) {
          blocks[i] = AIR;
        } else if (dTerrain <= 1) {
          blocks[i] = H <= SEA_LEVEL + 2 ? SAND : GRASS;
        } else if (dTerrain <= 4) {
          blocks[i] = DIRT;
        } else {
          blocks[i] = STONE;
        }
      }
    }
  }

  return { x0, y0, z0, nx, ny, nz, blocks, hints };
}

/** §7.1: the hint is a pure function of (seed, generatorVersion, cell),
 *  available for every block in any region a job meshes. */
export function hintAt(seed: readonly [number, number], x: number, y: number, z: number): number {
  return generateRegion(seed, x, y, z, 1, 1, 1).hints[0]!;
}

export function generateChunk(
  seed: readonly [number, number],
  cx: number, cy: number, cz: number,
): ChunkGen {
  const yMin = cy * CHUNK;
  const yMax = yMin + CHUNK;
  if (yMax <= BAND_MIN) return { storage: { kind: 'uniform', value: STONE }, hints: 'saturated' };
  if (yMin >= BAND_MAX) return { storage: { kind: 'uniform', value: AIR }, hints: 'saturated' };

  const r = generateRegion(seed, cx * CHUNK, yMin, cz * CHUNK, CHUNK, CHUNK, CHUNK);

  let uniformValue: number | null = r.blocks[0]!;
  let saturated = true;
  for (let i = 0; i < r.blocks.length; i++) {
    if (uniformValue !== null && r.blocks[i] !== uniformValue) uniformValue = null;
    const h = r.hints[i]!;
    if (h !== 127 && h !== -127) saturated = false;
    if (uniformValue === null && !saturated) break;
  }
  return {
    storage:
      uniformValue !== null
        ? { kind: 'uniform', value: uniformValue }
        : { kind: 'dense', blocks: r.blocks },
    hints: saturated ? 'saturated' : r.hints,
  };
}
