// STUDY COPY (scratchpad): identical to the repo mesher except that the
// result also carries `corners`, each emitted vertex's lattice corner in
// chunk-local block coordinates.
// §7: "guarded surface nets" — Minecraft's culled-face topology with
// vertices moved inside their cells. Starting positions interpolate the
// generator's density hints; shape-edited neighbourhoods relax under a
// damped Jacobi, inside a per-vertex constraint box built from the
// thin-feature guard, the D-3 clearance zone, and sharp pinning. All
// float work is f64 with a fixed visiting order, then quantised to 1/256,
// which is what makes shared vertices identical across chunks (§7.5).
//
// Internals are SoA over typed arrays: the first version measured at
// 105–175 ms per 38³ region; this one must stay in single-digit ms for
// C-12's same-frame edit budget.
import { CHUNK, localIndex } from '../world/coords';
import { AIR, materialOf, isSharp } from '../world/block';

export interface MeshParams {
  /** §7.9: 'hints' is the surface-nets rule above; 'bevel' ignores ρ and
   *  relaxation, moves each corner by the occupancy table, shifts material
   *  seams in-plane, and flags every vertex for flat shading. */
  rule: 'hints' | 'bevel';
  k: number; // relaxation iterations (§7.3)
  lambda: number; // damping
  guard: readonly number[]; // G[n6], §7.4
  capHorizontal: number; // D-3 clearance caps
  capVertical: number;
  bevel: number; // §7.9: per-axis cap on the table offset
  seam: number; // §7.9: in-plane shift at a material seam corner
  forceZeroOffsets: boolean; // test-only cube-reproduction switch (§14)
  /** STUDY (gh): 'd3' caps every clearance-zone cell (§7.4 rule 2);
   *  'narrow' caps an axis only where the air being intruded is a narrow
   *  opening along that axis (x/z run of 1, y run of at most 2). */
  clearance: 'd3' | 'narrow';
  /** STUDY (gh): QEF regularisation toward the mass point (per crossing). */
  qefMu: number;
  /** STUDY (gh): 'corner' = §7.2 AO at the lattice corner; 'position' = the
   *  same 4x4x4 solid fraction, trilinearly interpolated between lattice
   *  corners at the vertex's quantised position. */
  aoMode: 'corner' | 'position';
}

export const DEFAULT_PARAMS: MeshParams = {
  rule: 'hints',
  k: 6,
  lambda: 0.5,
  guard: [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5],
  capHorizontal: 0.15,
  capVertical: 0.05,
  bevel: 0.25,
  seam: 0.25,
  forceZeroOffsets: false,
  clearance: 'd3',
  qefMu: 0.05,
  aoMode: 'corner',
};

const cellBit = (ox: number, oy: number, oz: number): number => ox | (oz << 1) | (oy << 2);

/** The 4 blocks of layer `o` along `axis`, in (u, v) order (0,0) (1,0) (0,1)
 *  (1,1), where (u, v) are the other two axes in x < y < z order. */
function layerOf(mask: number, axis: number, o: number): [number, number, number, number] {
  const at = (ox: number, oy: number, oz: number): number => (mask >> cellBit(ox, oy, oz)) & 1;
  if (axis === 0) return [at(o, 0, 0), at(o, 1, 0), at(o, 0, 1), at(o, 1, 1)];
  if (axis === 1) return [at(0, o, 0), at(1, o, 0), at(0, o, 1), at(1, o, 1)];
  return [at(0, 0, o), at(1, 0, o), at(0, 1, o), at(1, 1, o)];
}

/** 2D bilinear-isosurface rule on one layer: 1 of 4 → ¼ toward the solid
 *  block, 3 of 4 → ¼ toward the air block (both: toward the odd one); a
 *  straight or diagonal pair, empty or full → 0. */
function rule2d(c: [number, number, number, number]): [number, number] {
  const n = c[0] + c[1] + c[2] + c[3];
  if (n !== 1 && n !== 3) return [0, 0];
  return [c[1] + c[3] === 1 ? 0.25 : -0.25, c[2] + c[3] === 1 ? 0.25 : -0.25];
}

/** §7.9 bevel table. `mask` bit = ox | oz << 1 | oy << 2 over the corner's
 *  8 blocks (the s000, s100, s001, … order). Treat occupancy as trilinear
 *  density f; the corner moves along ∇f to where f = ½:
 *  d = (½ − f)·∇f / |∇f|², which with integer half-counts p is
 *  (4 − n)(2p − n) / (2·Σ(2p − n)²). A flat half (n = 4 along one axis) and
 *  a zero gradient (blocks touching only diagonally) give 0.
 *
 *  One exception, for outline corners of one-block-thick layers (a terrace
 *  step's plan corners, a window's corners in a one-thick wall): there the
 *  3D gradient is dominated by the uniform layer next door and the corner
 *  would barely move in the layer's plane. When one layer along an axis is
 *  uniform and the other is a 1-of-4 or 3-of-4 outline, that layer's 2D
 *  rule sets the two in-plane components, and the remaining component is
 *  the sum of the 2D rules of the other four layers. A diagonal terrace
 *  edge then becomes a straight line in plan, as a 1:1 stair becomes a
 *  plane in elevation. Straight edges, thick corners and flat halves are
 *  unaffected.
 *
 *  Values are raw (the mesher caps them per axis) and small rationals, so
 *  the quantised output is engine-independent. */
export function bevelOffset(mask: number): [number, number, number] {
  const fold = (v: number): number => (v === 0 ? 0 : v); // no −0
  const base = [0, 0, 0];
  const slab = [0, 0, 0];
  const over = [false, false, false];
  let anySlab = false;
  for (let axis = 0; axis < 3; axis++) {
    const u = axis === 0 ? 1 : 0;
    const v = axis === 2 ? 1 : 2;
    const l0 = layerOf(mask, axis, 0);
    const l1 = layerOf(mask, axis, 1);
    const r0 = rule2d(l0);
    const r1 = rule2d(l1);
    base[u]! += r0[0] + r1[0];
    base[v]! += r0[1] + r1[1];
    const n0 = l0[0] + l0[1] + l0[2] + l0[3];
    const n1 = l1[0] + l1[1] + l1[2] + l1[3];
    const uniform0 = n0 === 0 || n0 === 4;
    const uniform1 = n1 === 0 || n1 === 4;
    const outline0 = n0 === 1 || n0 === 3;
    const outline1 = n1 === 1 || n1 === 3;
    if ((uniform0 && outline1) || (uniform1 && outline0)) {
      const r = uniform0 ? r1 : r0;
      slab[u]! += r[0];
      slab[v]! += r[1];
      over[u] = true;
      over[v] = true;
      anySlab = true;
    }
  }
  if (anySlab) {
    return [
      fold(over[0] ? slab[0]! : base[0]!),
      fold(over[1] ? slab[1]! : base[1]!),
      fold(over[2] ? slab[2]! : base[2]!),
    ];
  }

  let n = 0;
  let px = 0;
  let py = 0;
  let pz = 0;
  for (let b = 0; b < 8; b++) {
    if (((mask >> b) & 1) === 0) continue;
    n += 1;
    if ((b & 1) !== 0) px += 1;
    if ((b & 2) !== 0) pz += 1;
    if ((b & 4) !== 0) py += 1;
  }
  if (n === 0 || n === 8) return [0, 0, 0];
  const gx = 2 * px - n;
  const gy = 2 * py - n;
  const gz = 2 * pz - n;
  const s = gx * gx + gy * gy + gz * gz;
  if (s === 0) return [0, 0, 0];
  const k = (4 - n) / (2 * s);
  return [fold(k * gx), fold(k * gy), fold(k * gz)];
}

const BEVEL_TABLE: Float64Array = (() => {
  const t = new Float64Array(256 * 3);
  for (let mask = 0; mask < 256; mask++) {
    const d = bevelOffset(mask);
    t[mask * 3] = d[0];
    t[mask * 3 + 1] = d[1];
    t[mask * 3 + 2] = d[2];
  }
  return t;
})();

/** §7.9: the six masks whose 4 solid blocks share one face plane:
 *  [mask, axis, half] with half = which side of the plane is solid. */
const FLAT_HALVES: ReadonlyArray<readonly [number, number, number]> = [
  [0x55, 0, 0], [0xaa, 0, 1],
  [0x0f, 1, 0], [0xf0, 1, 1],
  [0x33, 2, 0], [0xcc, 2, 1],
];

export interface MeshRegionInput {
  nx: number;
  ny: number;
  nz: number;
  /** The emitted chunk occupies [apron, apron+32)³ in region coords. */
  apron: number;
  blocks: Uint16Array;
  /** ρ per block: hint/127, or ±1 where shape-edited (§7.1). */
  rho: Float32Array;
  shapeEdited: Uint8Array;
  params?: Partial<MeshParams> | undefined;
  /** STUDY (gh): optional per-edge crossing, 3 per block: crossT[i*3+a] is
   *  the crossing on the edge from block i to i+e_a, measured from block i
   *  (0..1); negative = use ρ. */
  crossT?: Float32Array | undefined;
  /** STUDY (gh): optional per-edge surface normal, 9 per block:
   *  crossN[i*9+a*3+c]. A zero vector marks a crossing with no slope
   *  evidence; such crossings only feed the mass point. When any crossing of
   *  a cell has a normal, the vertex is the mass point projected onto those
   *  tangent planes (regularised QEF, weight qefMu toward the mass point). */
  crossN?: Float32Array | undefined;
}

export interface MeshResult {
  vertexData: ArrayBuffer; // A.1, 16 B stride
  vertexCount: number;
  indexData: Uint32Array;
  quadCount: number;
  /** CPU copy for collision/picking (§9.3): chunk-local f32 xyz. */
  positions: Float32Array;
  /** u32 per quad: lowerLocalIndex | axis<<15 | lowerIsSolid<<17 (§7.2). */
  pickRecords: Uint32Array;
  /** CSR offsets by lower block local index (32769 entries). */
  pickOffsets: Uint32Array;
  /** STUDY: lattice corner (chunk-local) of each emitted vertex. */
  corners: Int32Array;
}

export function meshRegion(input: MeshRegionInput): MeshResult {
  const PROF = (globalThis as { __MESH_PROF?: Record<string, number> }).__MESH_PROF;
  let tMark = PROF ? performance.now() : 0;
  const mark = (name: string): void => {
    if (!PROF) return;
    const now = performance.now();
    PROF[name] = (PROF[name] ?? 0) + (now - tMark);
    tMark = now;
  };
  const p: MeshParams = { ...DEFAULT_PARAMS, ...input.params };
  const { nx, ny, nz, apron, blocks, rho, shapeEdited } = input;
  const crossT = input.crossT;
  const crossN = input.crossN;
  // QEF accumulator: a00 a01 a02 a11 a12 a22 b0 b1 b2 n
  const qf = new Float64Array(10);
  const qacc = (lower: number, axis: number, px: number, py: number, pz: number): void => {
    if (!crossN) return;
    const o = lower * 9 + axis * 3;
    const n0 = crossN[o]!;
    const n1 = crossN[o + 1]!;
    const n2 = crossN[o + 2]!;
    if (n0 === 0 && n1 === 0 && n2 === 0) return;
    const d = n0 * px + n1 * py + n2 * pz;
    qf[0] = qf[0]! + n0 * n0;
    qf[1] = qf[1]! + n0 * n1;
    qf[2] = qf[2]! + n0 * n2;
    qf[3] = qf[3]! + n1 * n1;
    qf[4] = qf[4]! + n1 * n2;
    qf[5] = qf[5]! + n2 * n2;
    qf[6] = qf[6]! + n0 * d;
    qf[7] = qf[7]! + n1 * d;
    qf[8] = qf[8]! + n2 * d;
    qf[9] = qf[9]! + 1;
  };
  const total = nx * ny * nz;

  // ---- precompute occupancy ----
  const solid = new Uint8Array(total);
  const sharpSolid = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const v = blocks[i]!;
    if (materialOf(v) !== AIR) {
      solid[i] = 1;
      if (isSharp(v)) sharpSolid[i] = 1;
    }
  }
  const SX = 1; // block index strides
  const SZ = nx;
  const SY = nx * nz;
  const bi = (x: number, y: number, z: number): number => y * SY + z * SZ + x * SX;

  // ---- pass 1: mixed corners → SoA vertices ----
  // Corner (x,y,z) ∈ [1, n−1] touches blocks (x−1..x, y−1..y, z−1..z).
  const cnx = nx - 1;
  const cnz = nz - 1;
  const cornerVert = new Int32Array(cnx * (ny - 1) * cnz).fill(-1);
  const ci = (x: number, y: number, z: number): number =>
    ((y - 1) * cnz + (z - 1)) * cnx + (x - 1);

  const vcx: number[] = [];
  const vcy: number[] = [];
  const vcz: number[] = [];
  const vd: number[] = []; // 3 per vertex
  const vlo: number[] = [];
  const vhi: number[] = [];
  const vInR: number[] = [];

  // 12 cell edges: [axis, blockA(ox,oy,oz) packed, crossing base coords].
  // Enumerated in the same (oy, oz, ox, axis) order as the reference
  // implementation so float summation order is unchanged.
  const guard = p.guard;
  const capH = p.capHorizontal;
  const capV = p.capVertical;

  let anyEdits = false;
  for (let i = 0; i < total; i++) {
    if (shapeEdited[i] === 1) {
      anyEdits = true;
      break;
    }
  }
  const bevelMode = p.rule === 'bevel';
  const narrowMode = p.clearance === 'narrow';
  const bevelMax = p.bevel;
  const seam = p.seam;
  const flatHalfAxis = new Int8Array(256).fill(-1);
  const flatHalfSide = new Int8Array(256);
  for (const [mask, axis, half] of FLAT_HALVES) {
    flatHalfAxis[mask] = axis;
    flatHalfSide[mask] = half;
  }
  /** pin test for one cell edge: is the solid block of the pair sharp? */
  const pinOf = (ia: number, sa: number, ib: number): boolean =>
    sa === 1 ? sharpSolid[ia]! === 1 : sharpSolid[ib]! === 1;

  for (let y = 1; y < ny; y++) {
    for (let z = 1; z < nz; z++) {
      let i000 = bi(0, y - 1, z - 1);
      for (let x = 1; x < nx; x++, i000++) {
        const s000 = solid[i000]!;
        const s100 = solid[i000 + SX]!;
        const s001 = solid[i000 + SZ]!;
        const s101 = solid[i000 + SX + SZ]!;
        const s010 = solid[i000 + SY]!;
        const s110 = solid[i000 + SY + SX]!;
        const s011 = solid[i000 + SY + SZ]!;
        const s111 = solid[i000 + SY + SX + SZ]!;
        const sum = s000 + s100 + s001 + s101 + s010 + s110 + s011 + s111;
        if (sum === 0 || sum === 8) continue;

        const i100 = i000 + SX;
        const i001 = i000 + SZ;
        const i101 = i000 + SX + SZ;
        const i010 = i000 + SY;
        const i110 = i000 + SY + SX;
        const i011 = i000 + SY + SZ;
        const i111 = i000 + SY + SX + SZ;

        let sx = 0;
        let sy = 0;
        let sz = 0;
        let crossings = 0;
        let inR = 0;
        if (crossN) qf.fill(0);
        let pin0 = false;
        let pin1 = false;
        let pin2 = false;

        if (anyEdits) {
          if (
            shapeEdited[i000] === 1 || shapeEdited[i100] === 1 || shapeEdited[i001] === 1 ||
            shapeEdited[i101] === 1 || shapeEdited[i010] === 1 || shapeEdited[i110] === 1 ||
            shapeEdited[i011] === 1 || shapeEdited[i111] === 1
          ) {
            inR = 1;
          }
        }

        if (bevelMode) {
          // §7.9: pins from the 12 cell edges, then the table offset,
          // capped per axis; then the in-plane seam shift on a flat half.
          if (s000 !== s100 && pinOf(i000, s000, i100)) pin0 = true;
          if (s001 !== s101 && pinOf(i001, s001, i101)) pin0 = true;
          if (s010 !== s110 && pinOf(i010, s010, i110)) pin0 = true;
          if (s011 !== s111 && pinOf(i011, s011, i111)) pin0 = true;
          if (s000 !== s010 && pinOf(i000, s000, i010)) pin1 = true;
          if (s100 !== s110 && pinOf(i100, s100, i110)) pin1 = true;
          if (s001 !== s011 && pinOf(i001, s001, i011)) pin1 = true;
          if (s101 !== s111 && pinOf(i101, s101, i111)) pin1 = true;
          if (s000 !== s001 && pinOf(i000, s000, i001)) pin2 = true;
          if (s100 !== s101 && pinOf(i100, s100, i101)) pin2 = true;
          if (s010 !== s011 && pinOf(i010, s010, i011)) pin2 = true;
          if (s110 !== s111 && pinOf(i110, s110, i111)) pin2 = true;
          const mask =
            s000 | (s100 << 1) | (s001 << 2) | (s101 << 3) |
            (s010 << 4) | (s110 << 5) | (s011 << 6) | (s111 << 7);
          sx = clampf(BEVEL_TABLE[mask * 3]!, -bevelMax, bevelMax);
          sy = clampf(BEVEL_TABLE[mask * 3 + 1]!, -bevelMax, bevelMax);
          sz = clampf(BEVEL_TABLE[mask * 3 + 2]!, -bevelMax, bevelMax);
          crossings = 1;
          const axis = flatHalfAxis[mask]!;
          if (seam > 0 && axis >= 0) {
            // The 4 solid blocks of the flat half, indexed (ou, ov) along
            // the face's tangent axes: x → (y, z), y → (x, z), z → (x, y).
            const half = flatHalfSide[mask]!;
            const base = i000 + (axis === 0 ? half * SX : axis === 1 ? half * SY : half * SZ);
            const su = axis === 0 ? SY : SX;
            const sv = axis === 2 ? SY : SZ;
            const c0 = base;
            const c1 = base + su;
            const c2 = base + sv;
            const c3 = base + su + sv;
            if (
              sharpSolid[c0]! === 0 && sharpSolid[c1]! === 0 &&
              sharpSolid[c2]! === 0 && sharpSolid[c3]! === 0
            ) {
              const m0 = materialOf(blocks[c0]!);
              const m1 = materialOf(blocks[c1]!);
              const m2 = materialOf(blocks[c2]!);
              const m3 = materialOf(blocks[c3]!);
              // exactly one block differs from the other three
              let odd = -1;
              if (m1 === m2 && m2 === m3 && m0 !== m1) odd = 0;
              else if (m0 === m2 && m2 === m3 && m1 !== m0) odd = 1;
              else if (m0 === m1 && m1 === m3 && m2 !== m0) odd = 2;
              else if (m0 === m1 && m1 === m2 && m3 !== m0) odd = 3;
              if (odd >= 0) {
                // toward the odd block's centre, within the plane
                const du = (odd & 1) === 1 ? seam : -seam;
                const dv = (odd & 2) === 2 ? seam : -seam;
                if (axis === 0) {
                  sy += du;
                  sz += dv;
                } else if (axis === 1) {
                  sx += du;
                  sz += dv;
                } else {
                  sx += du;
                  sy += dv;
                }
              }
            }
          }
        } else {
        // 12 cell edges, fully inlined, in the reference (oy, oz, ox, axis)
        // enumeration order so float summation order is frozen (§7.5).
        if (s000 !== s100) {
          if (s000 === 1 ? sharpSolid[i000]! === 1 : sharpSolid[i100]! === 1) pin0 = true;
          {
            const r0raw = rho[i000]!;
            const r1raw = rho[i100]!;
            const r0 = s000 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s000 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i000 * 3 + 0]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += -0.5 + t;
            sy += -0.5;
            sz += -0.5;
            crossings += 1;
            qacc(i000, 0, -0.5 + t, -0.5, -0.5);
          }
        }
        if (s000 !== s010) {
          if (s000 === 1 ? sharpSolid[i000]! === 1 : sharpSolid[i010]! === 1) pin1 = true;
          {
            const r0raw = rho[i000]!;
            const r1raw = rho[i010]!;
            const r0 = s000 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s000 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i000 * 3 + 1]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += -0.5;
            sy += -0.5 + t;
            sz += -0.5;
            crossings += 1;
            qacc(i000, 1, -0.5, -0.5 + t, -0.5);
          }
        }
        if (s000 !== s001) {
          if (s000 === 1 ? sharpSolid[i000]! === 1 : sharpSolid[i001]! === 1) pin2 = true;
          {
            const r0raw = rho[i000]!;
            const r1raw = rho[i001]!;
            const r0 = s000 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s000 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i000 * 3 + 2]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += -0.5;
            sy += -0.5;
            sz += -0.5 + t;
            crossings += 1;
            qacc(i000, 2, -0.5, -0.5, -0.5 + t);
          }
        }
        if (s100 !== s110) {
          if (s100 === 1 ? sharpSolid[i100]! === 1 : sharpSolid[i110]! === 1) pin1 = true;
          {
            const r0raw = rho[i100]!;
            const r1raw = rho[i110]!;
            const r0 = s100 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s100 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i100 * 3 + 1]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += 0.5;
            sy += -0.5 + t;
            sz += -0.5;
            crossings += 1;
            qacc(i100, 1, 0.5, -0.5 + t, -0.5);
          }
        }
        if (s100 !== s101) {
          if (s100 === 1 ? sharpSolid[i100]! === 1 : sharpSolid[i101]! === 1) pin2 = true;
          {
            const r0raw = rho[i100]!;
            const r1raw = rho[i101]!;
            const r0 = s100 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s100 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i100 * 3 + 2]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += 0.5;
            sy += -0.5;
            sz += -0.5 + t;
            crossings += 1;
            qacc(i100, 2, 0.5, -0.5, -0.5 + t);
          }
        }
        if (s001 !== s101) {
          if (s001 === 1 ? sharpSolid[i001]! === 1 : sharpSolid[i101]! === 1) pin0 = true;
          {
            const r0raw = rho[i001]!;
            const r1raw = rho[i101]!;
            const r0 = s001 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s001 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i001 * 3 + 0]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += -0.5 + t;
            sy += -0.5;
            sz += 0.5;
            crossings += 1;
            qacc(i001, 0, -0.5 + t, -0.5, 0.5);
          }
        }
        if (s001 !== s011) {
          if (s001 === 1 ? sharpSolid[i001]! === 1 : sharpSolid[i011]! === 1) pin1 = true;
          {
            const r0raw = rho[i001]!;
            const r1raw = rho[i011]!;
            const r0 = s001 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s001 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i001 * 3 + 1]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += -0.5;
            sy += -0.5 + t;
            sz += 0.5;
            crossings += 1;
            qacc(i001, 1, -0.5, -0.5 + t, 0.5);
          }
        }
        if (s101 !== s111) {
          if (s101 === 1 ? sharpSolid[i101]! === 1 : sharpSolid[i111]! === 1) pin1 = true;
          {
            const r0raw = rho[i101]!;
            const r1raw = rho[i111]!;
            const r0 = s101 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s101 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i101 * 3 + 1]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += 0.5;
            sy += -0.5 + t;
            sz += 0.5;
            crossings += 1;
            qacc(i101, 1, 0.5, -0.5 + t, 0.5);
          }
        }
        if (s010 !== s110) {
          if (s010 === 1 ? sharpSolid[i010]! === 1 : sharpSolid[i110]! === 1) pin0 = true;
          {
            const r0raw = rho[i010]!;
            const r1raw = rho[i110]!;
            const r0 = s010 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s010 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i010 * 3 + 0]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += -0.5 + t;
            sy += 0.5;
            sz += -0.5;
            crossings += 1;
            qacc(i010, 0, -0.5 + t, 0.5, -0.5);
          }
        }
        if (s010 !== s011) {
          if (s010 === 1 ? sharpSolid[i010]! === 1 : sharpSolid[i011]! === 1) pin2 = true;
          {
            const r0raw = rho[i010]!;
            const r1raw = rho[i011]!;
            const r0 = s010 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s010 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i010 * 3 + 2]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += -0.5;
            sy += 0.5;
            sz += -0.5 + t;
            crossings += 1;
            qacc(i010, 2, -0.5, 0.5, -0.5 + t);
          }
        }
        if (s110 !== s111) {
          if (s110 === 1 ? sharpSolid[i110]! === 1 : sharpSolid[i111]! === 1) pin2 = true;
          {
            const r0raw = rho[i110]!;
            const r1raw = rho[i111]!;
            const r0 = s110 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s110 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i110 * 3 + 2]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += 0.5;
            sy += 0.5;
            sz += -0.5 + t;
            crossings += 1;
            qacc(i110, 2, 0.5, 0.5, -0.5 + t);
          }
        }
        if (s011 !== s111) {
          if (s011 === 1 ? sharpSolid[i011]! === 1 : sharpSolid[i111]! === 1) pin0 = true;
          {
            const r0raw = rho[i011]!;
            const r1raw = rho[i111]!;
            const r0 = s011 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s011 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const ct = crossT ? crossT[i011 * 3 + 0]! : -1;
            const t = ct >= 0 ? ct : r0 / (r0 - r1);
            sx += -0.5 + t;
            sy += 0.5;
            sz += 0.5;
            crossings += 1;
            qacc(i011, 0, -0.5 + t, 0.5, 0.5);
          }
        }
        }

        // thin-feature guard (§7.4 rule 1): min G[n6] over non-sharp
        // blocks; n6 counting stops at 3, where G saturates to 0.5.
        let hw = 0.5;
        const bxc = x - 1;
        const byc = y - 1;
        const bzc = z - 1;
        if (sharpSolid[i000]! !== 1) {
          const g = guard[n6capped(solid, i000, s000, bxc + 0, byc + 0, bzc + 0, nx, ny, nz, SX, SY, SZ)] ?? 0.5;
          if (g < hw) hw = g;
        }
        if (sharpSolid[i100]! !== 1) {
          const g = guard[n6capped(solid, i100, s100, bxc + 1, byc + 0, bzc + 0, nx, ny, nz, SX, SY, SZ)] ?? 0.5;
          if (g < hw) hw = g;
        }
        if (sharpSolid[i001]! !== 1) {
          const g = guard[n6capped(solid, i001, s001, bxc + 0, byc + 0, bzc + 1, nx, ny, nz, SX, SY, SZ)] ?? 0.5;
          if (g < hw) hw = g;
        }
        if (sharpSolid[i101]! !== 1) {
          const g = guard[n6capped(solid, i101, s101, bxc + 1, byc + 0, bzc + 1, nx, ny, nz, SX, SY, SZ)] ?? 0.5;
          if (g < hw) hw = g;
        }
        if (sharpSolid[i010]! !== 1) {
          const g = guard[n6capped(solid, i010, s010, bxc + 0, byc + 1, bzc + 0, nx, ny, nz, SX, SY, SZ)] ?? 0.5;
          if (g < hw) hw = g;
        }
        if (sharpSolid[i110]! !== 1) {
          const g = guard[n6capped(solid, i110, s110, bxc + 1, byc + 1, bzc + 0, nx, ny, nz, SX, SY, SZ)] ?? 0.5;
          if (g < hw) hw = g;
        }
        if (sharpSolid[i011]! !== 1) {
          const g = guard[n6capped(solid, i011, s011, bxc + 0, byc + 1, bzc + 1, nx, ny, nz, SX, SY, SZ)] ?? 0.5;
          if (g < hw) hw = g;
        }
        if (sharpSolid[i111]! !== 1) {
          const g = guard[n6capped(solid, i111, s111, bxc + 1, byc + 1, bzc + 1, nx, ny, nz, SX, SY, SZ)] ?? 0.5;
          if (g < hw) hw = g;
        }

        let lo0 = -hw;
        let lo1 = -hw;
        let lo2 = -hw;
        let hi0 = hw;
        let hi1 = hw;
        let hi2 = hw;

        if (anyEdits) {
          // clearance zone qualification (§7.4 rule 2)
          let clearance = inR === 1;
          if (!clearance) {
            clearance =
              nearEditedSolid(shapeEdited, solid, i000, s000, bxc, byc, bzc, nx, ny, nz, SX, SY, SZ) ||
              nearEditedSolid(shapeEdited, solid, i100, s100, bxc + 1, byc, bzc, nx, ny, nz, SX, SY, SZ) ||
              nearEditedSolid(shapeEdited, solid, i001, s001, bxc, byc, bzc + 1, nx, ny, nz, SX, SY, SZ) ||
              nearEditedSolid(shapeEdited, solid, i101, s101, bxc + 1, byc, bzc + 1, nx, ny, nz, SX, SY, SZ) ||
              nearEditedSolid(shapeEdited, solid, i010, s010, bxc, byc + 1, bzc, nx, ny, nz, SX, SY, SZ) ||
              nearEditedSolid(shapeEdited, solid, i110, s110, bxc + 1, byc + 1, bzc, nx, ny, nz, SX, SY, SZ) ||
              nearEditedSolid(shapeEdited, solid, i011, s011, bxc, byc + 1, bzc + 1, nx, ny, nz, SX, SY, SZ) ||
              nearEditedSolid(shapeEdited, solid, i111, s111, bxc + 1, byc + 1, bzc + 1, nx, ny, nz, SX, SY, SZ);
          }
          if (clearance) {
            const nw = narrowMode;
            const plusX = s100 + s101 + s110 + s111;
            const minusX = s000 + s001 + s010 + s011;
            if (plusX <= minusX && capH < hi0 && (!nw || narrowAt(solid, 0, 1, i000, x - 1, y - 1, z - 1, nx, ny, nz, SX, SY, SZ))) hi0 = capH;
            if (minusX <= plusX && -capH > lo0 && (!nw || narrowAt(solid, 0, 0, i000, x - 1, y - 1, z - 1, nx, ny, nz, SX, SY, SZ))) lo0 = -capH;
            const plusY = s010 + s110 + s011 + s111;
            const minusY = s000 + s100 + s001 + s101;
            if (plusY <= minusY && capV < hi1 && (!nw || narrowAt(solid, 1, 1, i000, x - 1, y - 1, z - 1, nx, ny, nz, SX, SY, SZ))) hi1 = capV;
            if (minusY <= plusY && -capV > lo1 && (!nw || narrowAt(solid, 1, 0, i000, x - 1, y - 1, z - 1, nx, ny, nz, SX, SY, SZ))) lo1 = -capV;
            const plusZ = s001 + s101 + s011 + s111;
            const minusZ = s000 + s100 + s010 + s110;
            if (plusZ <= minusZ && capH < hi2 && (!nw || narrowAt(solid, 2, 1, i000, x - 1, y - 1, z - 1, nx, ny, nz, SX, SY, SZ))) hi2 = capH;
            if (minusZ <= plusZ && -capH > lo2 && (!nw || narrowAt(solid, 2, 0, i000, x - 1, y - 1, z - 1, nx, ny, nz, SX, SY, SZ))) lo2 = -capH;
          }
        }
        if (pin0) {
          lo0 = 0;
          hi0 = 0;
        }
        if (pin1) {
          lo1 = 0;
          hi1 = 0;
        }
        if (pin2) {
          lo2 = 0;
          hi2 = 0;
        }

        const inv = crossings > 0 ? 1 / crossings : 0;
        if (crossN && qf[9]! > 0 && !bevelMode) {
          // regularised QEF: (A + mu I) v = b + mu m, m = mass point
          const mx0 = sx * inv;
          const my0 = sy * inv;
          const mz0 = sz * inv;
          const mu = p.qefMu * crossings;
          const a00 = qf[0]! + mu;
          const a01 = qf[1]!;
          const a02 = qf[2]!;
          const a11 = qf[3]! + mu;
          const a12 = qf[4]!;
          const a22 = qf[5]! + mu;
          const b0 = qf[6]! + mu * mx0;
          const b1 = qf[7]! + mu * my0;
          const b2 = qf[8]! + mu * mz0;
          // Cramer's rule, fixed order
          const c00 = a11 * a22 - a12 * a12;
          const c01 = a02 * a12 - a01 * a22;
          const c02 = a01 * a12 - a02 * a11;
          const det = a00 * c00 + a01 * c01 + a02 * c02;
          if (det > 1e-12) {
            const c11 = a00 * a22 - a02 * a02;
            const c12 = a01 * a02 - a00 * a12;
            const c22 = a00 * a11 - a01 * a01;
            const vx = (c00 * b0 + c01 * b1 + c02 * b2) / det;
            const vy = (c01 * b0 + c11 * b1 + c12 * b2) / det;
            const vz = (c02 * b0 + c12 * b1 + c22 * b2) / det;
            sx = vx * crossings;
            sy = vy * crossings;
            sz = vz * crossings;
          }
        }
        const vi = vcx.length;
        cornerVert[ci(x, y, z)] = vi;
        vcx.push(x);
        vcy.push(y);
        vcz.push(z);
        if (p.forceZeroOffsets) vd.push(0, 0, 0);
        else {
          vd.push(
            clampf(sx * inv, lo0, hi0),
            clampf(sy * inv, lo1, hi1),
            clampf(sz * inv, lo2, hi2),
          );
        }
        vlo.push(lo0, lo1, lo2);
        vhi.push(hi0, hi1, hi2);
        vInR.push(inR);
      }
    }
  }
  mark('corners');
  const vertCount = vcx.length;
  const d = Float64Array.from(vd);
  const lo = Float64Array.from(vlo);
  const hi = Float64Array.from(vhi);

  // ---- pass 2: quads (region-wide, world-lexicographic order) ----
  // Mesh-edge neighbours live in 6 fixed slots per vertex (ring edges are
  // unit axis steps), giving allocation-free dedup and the fixed
  // −x,+x,−y,+y,−z,+z visiting order of §7.3.
  const neigh = new Int32Array(vertCount * 6).fill(-1);
  const qa: number[] = []; // corner ids ×4 (ring, CCW from air for lower-solid)
  const qmeta: number[] = []; // axis | solidIsLower<<2 | sharp<<3 | owned<<4
  const qlower: number[] = []; // lower block region index
  const qmat: number[] = [];

  const slotOf = (axis: number, dir: number): number => axis * 2 + (dir > 0 ? 1 : 0);
  const link = (a: number, b: number, axis: number, dir: number): void => {
    neigh[a * 6 + slotOf(axis, dir)] = b;
    neigh[b * 6 + slotOf(axis, -dir)] = a;
  };

  const chunkLo = apron;
  const chunkHi = apron + CHUNK;

  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const i0 = bi(x, y, z);
        const s0 = solid[i0]!;
        for (let axis = 0; axis < 3; axis++) {
          let x1 = x;
          let y1 = y;
          let z1 = z;
          if (axis === 0) x1 += 1;
          else if (axis === 1) y1 += 1;
          else z1 += 1;
          if (x1 >= nx || y1 >= ny || z1 >= nz) continue;
          const i1 = bi(x1, y1, z1);
          if (s0 === solid[i1]!) continue;

          // face corners: axis coord = lower+1, tangent axes span 0..1
          const fx = x1;
          const fy = y1;
          const fz = z1;
          let c0: number;
          let c1: number;
          let c2: number;
          let c3: number;
          if (axis === 0) {
            if (fy < 1 || fz < 1 || fy + 1 >= ny || fz + 1 >= nz || fx < 1 || fx >= nx) continue;
            c0 = cornerVert[ci(fx, fy, fz)]!;
            c1 = cornerVert[ci(fx, fy + 1, fz)]!;
            c2 = cornerVert[ci(fx, fy + 1, fz + 1)]!;
            c3 = cornerVert[ci(fx, fy, fz + 1)]!;
          } else if (axis === 1) {
            if (fx < 1 || fz < 1 || fx + 1 >= nx || fz + 1 >= nz || fy < 1 || fy >= ny) continue;
            c0 = cornerVert[ci(fx, fy, fz)]!;
            c1 = cornerVert[ci(fx + 1, fy, fz)]!;
            c2 = cornerVert[ci(fx + 1, fy, fz + 1)]!;
            c3 = cornerVert[ci(fx, fy, fz + 1)]!;
          } else {
            if (fx < 1 || fy < 1 || fx + 1 >= nx || fy + 1 >= ny || fz < 1 || fz >= nz) continue;
            c0 = cornerVert[ci(fx, fy, fz)]!;
            c1 = cornerVert[ci(fx + 1, fy, fz)]!;
            c2 = cornerVert[ci(fx + 1, fy + 1, fz)]!;
            c3 = cornerVert[ci(fx, fy + 1, fz)]!;
          }
          if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;

          const solidIdx = s0 === 1 ? i0 : i1;
          const sharp = sharpSolid[solidIdx]! === 1 && true;
          const owned =
            x >= chunkLo && x < chunkHi && y >= chunkLo && y < chunkHi && z >= chunkLo && z < chunkHi;

          qa.push(c0, c1, c2, c3);
          qmeta.push(axis | (s0 << 2) | ((sharp ? 1 : 0) << 3) | ((owned ? 1 : 0) << 4));
          qlower.push(i0);
          qmat.push(materialOf(blocks[solidIdx]!));

          // ring edges → neighbour slots (tangent axes, unit steps)
          if (axis === 0) {
            link(c0, c1, 1, 1);
            link(c3, c2, 1, 1);
            link(c0, c3, 2, 1);
            link(c1, c2, 2, 1);
          } else if (axis === 1) {
            link(c0, c1, 0, 1);
            link(c3, c2, 0, 1);
            link(c0, c3, 2, 1);
            link(c1, c2, 2, 1);
          } else {
            link(c0, c1, 0, 1);
            link(c3, c2, 0, 1);
            link(c0, c3, 1, 1);
            link(c1, c2, 1, 1);
          }
        }
      }
    }
  }
  const quadTotal = qmat.length;
  mark('quads');

  // ---- pass 3: damped Jacobi over R (§7.3); the bevel rule has none ----
  if (!p.forceZeroOffsets && p.k > 0 && !bevelMode) {
    const rList: number[] = [];
    for (let v = 0; v < vertCount; v++) if (vInR[v] === 1) rList.push(v);
    if (rList.length > 0) {
      let cur = d;
      let next = d.slice();
      for (let iter = 0; iter < p.k; iter++) {
        if (iter > 0) next.set(cur);
        for (const v of rList) {
          let mx = 0;
          let my = 0;
          let mz = 0;
          let count = 0;
          for (let slot = 0; slot < 6; slot++) {
            const w = neigh[v * 6 + slot]!;
            if (w < 0) continue;
            mx += vcx[w]! - vcx[v]! + cur[w * 3]!;
            my += vcy[w]! - vcy[v]! + cur[w * 3 + 1]!;
            mz += vcz[w]! - vcz[v]! + cur[w * 3 + 2]!;
            count += 1;
          }
          if (count === 0) continue;
          const inv = 1 / count;
          const d0 = cur[v * 3]!;
          const d1 = cur[v * 3 + 1]!;
          const d2 = cur[v * 3 + 2]!;
          next[v * 3] = clampf(d0 + p.lambda * (mx * inv - d0), lo[v * 3]!, hi[v * 3]!);
          next[v * 3 + 1] = clampf(d1 + p.lambda * (my * inv - d1), lo[v * 3 + 1]!, hi[v * 3 + 1]!);
          next[v * 3 + 2] = clampf(d2 + p.lambda * (mz * inv - d2), lo[v * 3 + 2]!, hi[v * 3 + 2]!);
        }
        const tmp = cur;
        cur = next;
        next = tmp;
      }
      if (cur !== d) d.set(cur);
    }
  }

  mark('relax');
  // ---- pass 4: quantise + per-corner smooth normal accumulation ----
  const dq = new Int32Array(vertCount * 3);
  for (let i = 0; i < vertCount * 3; i++) dq[i] = Math.round(d[i]! * 256);

  const px = (v: number): number => vcx[v]! + dq[v * 3]! / 256;
  const py = (v: number): number => vcy[v]! + dq[v * 3 + 1]! / 256;
  const pz = (v: number): number => vcz[v]! + dq[v * 3 + 2]! / 256;

  const nacc = new Float64Array(vertCount * 3);
  for (let q = 0; q < quadTotal; q++) {
    const meta = qmeta[q]!;
    if ((meta & 8) !== 0) continue; // sharp quads excluded (§7.2)
    const axis = meta & 3;
    const solidIsLower = (meta & 4) !== 0;
    const a = qa[q * 4]!;
    const b = qa[q * 4 + 1]!;
    const c = qa[q * 4 + 2]!;
    const dd = qa[q * 4 + 3]!;
    const abx = px(b) - px(a);
    const aby = py(b) - py(a);
    const abz = pz(b) - pz(a);
    const acx = px(c) - px(a);
    const acy = py(c) - py(a);
    const acz = pz(c) - pz(a);
    const adx = px(dd) - px(a);
    const ady = py(dd) - py(a);
    const adz = pz(dd) - pz(a);
    // cross(ab, ac) + cross(ac, ad)
    let nxx = aby * acz - abz * acy + (acy * adz - acz * ady);
    let nyy = abz * acx - abx * acz + (acz * adx - acx * adz);
    let nzz = abx * acy - aby * acx + (acx * ady - acy * adx);
    const sign = solidIsLower ? 1 : -1;
    const dirDot = axis === 0 ? nxx : axis === 1 ? nyy : nzz;
    if (dirDot * sign < 0) {
      nxx = -nxx;
      nyy = -nyy;
      nzz = -nzz;
    }
    nacc[a * 3] = nacc[a * 3]! + nxx;
    nacc[a * 3 + 1] = nacc[a * 3 + 1]! + nyy;
    nacc[a * 3 + 2] = nacc[a * 3 + 2]! + nzz;
    nacc[b * 3] = nacc[b * 3]! + nxx;
    nacc[b * 3 + 1] = nacc[b * 3 + 1]! + nyy;
    nacc[b * 3 + 2] = nacc[b * 3 + 2]! + nzz;
    nacc[c * 3] = nacc[c * 3]! + nxx;
    nacc[c * 3 + 1] = nacc[c * 3 + 1]! + nyy;
    nacc[c * 3 + 2] = nacc[c * 3 + 2]! + nzz;
    nacc[dd * 3] = nacc[dd * 3]! + nxx;
    nacc[dd * 3 + 1] = nacc[dd * 3 + 1]! + nyy;
    nacc[dd * 3 + 2] = nacc[dd * 3 + 2]! + nzz;
  }

  mark('normals');
  // ---- pass 5: emit chunk-owned quads in pick-record order ----
  const ownedIds: number[] = [];
  for (let q = 0; q < quadTotal; q++) if ((qmeta[q]! & 16) !== 0) ownedIds.push(q);
  const lowerLocalOf = (q: number): number => {
    const ib = qlower[q]!;
    const bxr = ib % nx;
    const bzr = Math.floor(ib / SZ) % nz;
    const byr = Math.floor(ib / SY);
    return localIndex(bxr - apron, byr - apron, bzr - apron);
  };
  // No sort: the quad pass iterates (y, z, x, axis), which IS ascending
  // (lowerLocalIndex, axis) order — the pick-CSR test verifies it.

  const maxVerts = ownedIds.length * 4;
  const vertexBytes = new Uint8Array(maxVerts * 16);
  const positions = new Float32Array(maxVerts * 3);
  const cornersOut = new Int32Array(maxVerts * 3);
  const indexData = new Uint32Array(ownedIds.length * 6);
  const pickRecords = new Uint32Array(ownedIds.length);
  const emittedSmooth = new Int32Array(vertCount * 8).fill(-1);
  let vertexCount = 0;
  let w16 = 0;

  const gradNormal = (v: number, out: Float64Array): void => {
    const x = vcx[v]!;
    const y = vcy[v]!;
    const z = vcz[v]!;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let oy = 0; oy < 2; oy++) {
      for (let oz = 0; oz < 2; oz++) {
        for (let ox = 0; ox < 2; ox++) {
          const r = rho[bi(x - 1 + ox, y - 1 + oy, z - 1 + oz)]!;
          gx += ox === 1 ? r : -r;
          gy += oy === 1 ? r : -r;
          gz += oz === 1 ? r : -r;
        }
      }
    }
    // sqrt of squares, not Math.hypot: hypot is implementation-
    // approximated (C-10) and these feed the hashed mesh goldens.
    const len = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (len > 1e-9) {
      out[0] = -gx / len;
      out[1] = -gy / len;
      out[2] = -gz / len;
    } else {
      out[0] = 0;
      out[1] = 1;
      out[2] = 0;
    }
  };
  const tmpN = new Float64Array(3);

  const aoOf = (v: number): number => {
    const cx0 = vcx[v]!;
    const cy0 = vcy[v]!;
    const cz0 = vcz[v]!;
    let count = 0;
    let totalN = 0;
    for (let y = cy0 - 2; y < cy0 + 2; y++) {
      if (y < 0 || y >= ny) continue;
      for (let z = cz0 - 2; z < cz0 + 2; z++) {
        if (z < 0 || z >= nz) continue;
        for (let x = cx0 - 2; x < cx0 + 2; x++) {
          if (x < 0 || x >= nx) continue;
          totalN += 1;
          count += solid[bi(x, y, z)]!;
        }
      }
    }
    const f = totalN > 0 ? count / totalN : 0;
    const ao = 1 - 1.2 * Math.max(0, f - 0.5);
    return ao < 0.55 ? 0.55 : ao > 1 ? 1 : ao;
  };

  /** 4x4x4 solid fraction around lattice corner (cx,cy,cz) in region coords,
   *  from a summed-volume table (integer counts; same value as aoOf's f). */
  const aoPosModeEarly = p.aoMode === 'position';
  const SVx = nx + 1;
  const SVz = nz + 1;
  const sv = aoPosModeEarly ? new Int32Array((nx + 1) * (ny + 1) * (nz + 1)) : new Int32Array(0);
  if (aoPosModeEarly) {
    for (let y = 1; y <= ny; y++) {
      for (let z = 1; z <= nz; z++) {
        for (let x = 1; x <= nx; x++) {
          const i = (y * SVz + z) * SVx + x;
          sv[i] = solid[bi(x - 1, y - 1, z - 1)]! +
            sv[i - 1]! + sv[i - SVx]! + sv[i - SVx * SVz]! -
            sv[i - 1 - SVx]! - sv[i - 1 - SVx * SVz]! - sv[i - SVx - SVx * SVz]! +
            sv[i - 1 - SVx - SVx * SVz]!;
        }
      }
    }
  }
  const boxFrac = (cx0: number, cy0: number, cz0: number): number => {
    const x0 = cx0 - 2 < 0 ? 0 : cx0 - 2;
    const y0 = cy0 - 2 < 0 ? 0 : cy0 - 2;
    const z0 = cz0 - 2 < 0 ? 0 : cz0 - 2;
    const x1 = cx0 + 2 > nx ? nx : cx0 + 2;
    const y1 = cy0 + 2 > ny ? ny : cy0 + 2;
    const z1 = cz0 + 2 > nz ? nz : cz0 + 2;
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return 0;
    const at = (x: number, y: number, z: number): number => sv[(y * SVz + z) * SVx + x]!;
    const count = at(x1, y1, z1) - at(x0, y1, z1) - at(x1, y0, z1) - at(x1, y1, z0) +
      at(x0, y0, z1) + at(x0, y1, z0) + at(x1, y0, z0) - at(x0, y0, z0);
    return count / ((x1 - x0) * (y1 - y0) * (z1 - z0));
  };
  const aoPos = (v: number): number => {
    // vertex position in lattice-corner units; interpolate boxFrac between
    // the 8 surrounding corners (exact rationals: offsets are k/256)
    const qx = dq[v * 3]!;
    const qy = dq[v * 3 + 1]!;
    const qz = dq[v * 3 + 2]!;
    const bx = qx < 0 ? vcx[v]! - 1 : vcx[v]!;
    const by = qy < 0 ? vcy[v]! - 1 : vcy[v]!;
    const bz = qz < 0 ? vcz[v]! - 1 : vcz[v]!;
    const fx = (qx < 0 ? 256 + qx : qx) / 256;
    const fy = (qy < 0 ? 256 + qy : qy) / 256;
    const fz = (qz < 0 ? 256 + qz : qz) / 256;
    let f = 0;
    for (let oy = 0; oy < 2; oy++) {
      const wy = oy === 1 ? fy : 1 - fy;
      if (wy === 0) continue;
      for (let oz = 0; oz < 2; oz++) {
        const wz = oz === 1 ? fz : 1 - fz;
        if (wz === 0) continue;
        for (let ox = 0; ox < 2; ox++) {
          const wx = ox === 1 ? fx : 1 - fx;
          if (wx === 0) continue;
          f += wx * wy * wz * boxFrac(bx + ox, by + oy, bz + oz);
        }
      }
    }
    const ao = 1 - 1.2 * Math.max(0, f - 0.5);
    return ao < 0.55 ? 0.55 : ao > 1 ? 1 : ao;
  };
  const aoPosMode = p.aoMode === 'position';

  const emitVertex = (v: number, material: number, sharp: boolean, fnx: number, fny: number, fnz: number): number => {
    const key = v * 8 + material;
    if (!sharp) {
      const existing = emittedSmooth[key]!;
      if (existing >= 0) return existing;
    }
    let nx0: number;
    let ny0: number;
    let nz0: number;
    if (sharp) {
      nx0 = fnx;
      ny0 = fny;
      nz0 = fnz;
    } else {
      const ax = nacc[v * 3]!;
      const ay = nacc[v * 3 + 1]!;
      const az = nacc[v * 3 + 2]!;
      const len = Math.sqrt(ax * ax + ay * ay + az * az);
      if (len > 1e-9) {
        nx0 = ax / len;
        ny0 = ay / len;
        nz0 = az / len;
      } else {
        gradNormal(v, tmpN);
        nx0 = tmpN[0]!;
        ny0 = tmpN[1]!;
        nz0 = tmpN[2]!;
      }
    }
    // octahedral encode
    const inv = 1 / (Math.abs(nx0) + Math.abs(ny0) + Math.abs(nz0) || 1);
    let ox = nx0 * inv;
    let oy = ny0 * inv;
    if (nz0 < 0) {
      const tx = (1 - Math.abs(oy)) * (ox >= 0 ? 1 : -1);
      const ty = (1 - Math.abs(ox)) * (oy >= 0 ? 1 : -1);
      ox = tx;
      oy = ty;
    }
    const sxq = Math.max(-32767, Math.min(32767, Math.round(ox * 32767)));
    const syq = Math.max(-32767, Math.min(32767, Math.round(oy * 32767)));

    const lx = vcx[v]! - apron;
    const ly = vcy[v]! - apron;
    const lz = vcz[v]! - apron;
    const fx = lx * 256 + 128 + dq[v * 3]!;
    const fy = ly * 256 + 128 + dq[v * 3 + 1]!;
    const fz = lz * 256 + 128 + dq[v * 3 + 2]!;
    const ao8 = Math.round((aoPosMode ? aoPos(v) : aoOf(v)) * 255);
    // flags: bit 0 sharp (flat vertex of its own); bit 1 faceted (§7.9: the
    // shader shades every triangle flat from screen derivatives).
    const flags = (sharp ? 1 : 0) | (bevelMode ? 2 : 0);

    vertexBytes[w16] = fx & 0xff;
    vertexBytes[w16 + 1] = (fx >> 8) & 0xff;
    vertexBytes[w16 + 2] = fy & 0xff;
    vertexBytes[w16 + 3] = (fy >> 8) & 0xff;
    vertexBytes[w16 + 4] = fz & 0xff;
    vertexBytes[w16 + 5] = (fz >> 8) & 0xff;
    vertexBytes[w16 + 6] = ao8;
    vertexBytes[w16 + 7] = flags;
    vertexBytes[w16 + 8] = sxq & 0xff;
    vertexBytes[w16 + 9] = (sxq >> 8) & 0xff;
    vertexBytes[w16 + 10] = syq & 0xff;
    vertexBytes[w16 + 11] = (syq >> 8) & 0xff;
    vertexBytes[w16 + 12] = material;
    w16 += 16;

    cornersOut[vertexCount * 3] = lx;
    cornersOut[vertexCount * 3 + 1] = ly;
    cornersOut[vertexCount * 3 + 2] = lz;
    positions[vertexCount * 3] = lx + dq[v * 3]! / 256;
    positions[vertexCount * 3 + 1] = ly + dq[v * 3 + 1]! / 256;
    positions[vertexCount * 3 + 2] = lz + dq[v * 3 + 2]! / 256;

    const out = vertexCount;
    vertexCount += 1;
    if (!sharp) emittedSmooth[key] = out;
    return out;
  };

  let qi = 0;
  for (const q of ownedIds) {
    const meta = qmeta[q]!;
    const axis = meta & 3;
    const solidIsLower = (meta & 4) !== 0;
    const sharp = (meta & 8) !== 0;
    const material = qmat[q]!;
    const r0 = qa[q * 4]!;
    const r1 = qa[q * 4 + 1]!;
    const r2 = qa[q * 4 + 2]!;
    const r3 = qa[q * 4 + 3]!;
    // CCW from the air side. The base corner order yields +axis winding
    // for x and z faces but −axis for y faces (x-then-z ordering), so the
    // y axis flips relative to the others.
    const airOnPlus = solidIsLower;
    const forward = axis === 1 ? !airOnPlus : airOnPlus;
    const ring = forward ? [r0, r1, r2, r3] : [r3, r2, r1, r0];
    let fnx = 0;
    let fny = 0;
    let fnz = 0;
    if (sharp) {
      const s = solidIsLower ? 1 : -1;
      if (axis === 0) fnx = s;
      else if (axis === 1) fny = s;
      else fnz = s;
    }
    const i0 = emitVertex(ring[0]!, material, sharp, fnx, fny, fnz);
    const i1 = emitVertex(ring[1]!, material, sharp, fnx, fny, fnz);
    const i2 = emitVertex(ring[2]!, material, sharp, fnx, fny, fnz);
    const i3 = emitVertex(ring[3]!, material, sharp, fnx, fny, fnz);
    // §7.2: triangulate on the shorter diagonal (0–2 on a tie).
    const dx02 = px(ring[0]!) - px(ring[2]!);
    const dy02 = py(ring[0]!) - py(ring[2]!);
    const dz02 = pz(ring[0]!) - pz(ring[2]!);
    const d02 = dx02 * dx02 + dy02 * dy02 + dz02 * dz02;
    const dx13 = px(ring[1]!) - px(ring[3]!);
    const dy13 = py(ring[1]!) - py(ring[3]!);
    const dz13 = pz(ring[1]!) - pz(ring[3]!);
    const d13 = dx13 * dx13 + dy13 * dy13 + dz13 * dz13;
    const base = qi * 6;
    if (d02 <= d13) {
      indexData[base] = i0;
      indexData[base + 1] = i1;
      indexData[base + 2] = i2;
      indexData[base + 3] = i0;
      indexData[base + 4] = i2;
      indexData[base + 5] = i3;
    } else {
      indexData[base] = i1;
      indexData[base + 1] = i2;
      indexData[base + 2] = i3;
      indexData[base + 3] = i1;
      indexData[base + 4] = i3;
      indexData[base + 5] = i0;
    }
    pickRecords[qi] = lowerLocalOf(q) | (axis << 15) | ((solidIsLower ? 1 : 0) << 17);
    qi += 1;
  }

  mark('emit');
  const pickOffsets = new Uint32Array(32768 + 1);
  for (let i = 0; i < pickRecords.length; i++) {
    const slot = (pickRecords[i]! & 0x7fff) + 1;
    pickOffsets[slot] = pickOffsets[slot]! + 1;
  }
  for (let i = 0; i < 32768; i++) pickOffsets[i + 1]! += pickOffsets[i]!;

  return {
    vertexData: vertexBytes.buffer.slice(0, vertexCount * 16),
    vertexCount,
    indexData,
    quadCount: ownedIds.length,
    positions: positions.slice(0, vertexCount * 3),
    pickRecords,
    pickOffsets,
    corners: cornersOut.slice(0, vertexCount * 3),
  };
}

function clampf(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** n6 capped at 3, where the guard table saturates to 0.5 (§7.4). */
function n6capped(
  solid: Uint8Array, ib: number, me: number,
  bx: number, by: number, bz: number,
  nx: number, ny: number, nz: number,
  SX: number, SY: number, SZ: number,
): number {
  let n = 0;
  n += bx > 0 ? (solid[ib - SX]! === me ? 1 : 0) : 1;
  n += bx < nx - 1 ? (solid[ib + SX]! === me ? 1 : 0) : 1;
  if (n > 2) return 3;
  n += by > 0 ? (solid[ib - SY]! === me ? 1 : 0) : 1;
  if (n > 2) return 3;
  n += by < ny - 1 ? (solid[ib + SY]! === me ? 1 : 0) : 1;
  if (n > 2) return 3;
  n += bz > 0 ? (solid[ib - SZ]! === me ? 1 : 0) : 1;
  if (n > 2) return 3;
  n += bz < nz - 1 ? (solid[ib + SZ]! === me ? 1 : 0) : 1;
  return n > 2 ? 3 : n;
}

/** STUDY (gh): is AIR block i (at x,y,z) part of a narrow opening along
 *  `axis`: x/z — solid on both sides (run 1); y — an air run of at most 2
 *  between solids (a 2-high room or tunnel). Out-of-region reads count as
 *  not solid. */
function airNarrow(
  solid: Uint8Array, i: number, axis: number,
  x: number, y: number, z: number,
  nx: number, ny: number, nz: number,
  SX: number, SY: number, SZ: number,
): boolean {
  if (axis === 0) return x > 0 && x < nx - 1 && solid[i - SX] === 1 && solid[i + SX] === 1;
  if (axis === 2) return z > 0 && z < nz - 1 && solid[i - SZ] === 1 && solid[i + SZ] === 1;
  const u1 = y + 1 < ny && solid[i + SY] === 1;
  const u2 = y + 2 < ny && solid[i + 2 * SY] === 1;
  const d1 = y > 0 && solid[i - SY] === 1;
  const d2 = y > 1 && solid[i - 2 * SY] === 1;
  return (u1 && (d1 || d2)) || (d1 && u2);
}

/** STUDY (gh): does the cell side (layer `hi` ∈ {0,1} along `axis`) hold an
 *  air block that is narrow along `axis`? (bx,by,bz) = the cell's lowest
 *  block, i000 its index. */
function narrowAt(
  solid: Uint8Array, axis: number, hi: number, i000: number,
  bx: number, by: number, bz: number,
  nx: number, ny: number, nz: number,
  SX: number, SY: number, SZ: number,
): boolean {
  for (let a = 0; a < 2; a++) {
    for (let b = 0; b < 2; b++) {
      const ox = axis === 0 ? hi : a;
      const oy = axis === 1 ? hi : axis === 0 ? a : b;
      const oz = axis === 2 ? hi : b;
      const i = i000 + ox * SX + oy * SY + oz * SZ;
      if (solid[i] === 0 && airNarrow(solid, i, axis, bx + ox, by + oy, bz + oz, nx, ny, nz, SX, SY, SZ)) return true;
    }
  }
  return false;
}

/** D-3: is this AIR block within 2-above/1-beside of a shape-edited solid? */
function nearEditedSolid(
  shapeEdited: Uint8Array, solid: Uint8Array,
  ib: number, me: number,
  bx: number, by: number, bz: number,
  nx: number, ny: number, nz: number,
  SX: number, SY: number, SZ: number,
): boolean {
  if (me === 1) return false;
  return (
    (by + 1 < ny && shapeEdited[ib + SY] === 1 && solid[ib + SY] === 1) ||
    (by + 2 < ny && shapeEdited[ib + 2 * SY] === 1 && solid[ib + 2 * SY] === 1) ||
    (bx > 0 && shapeEdited[ib - SX] === 1 && solid[ib - SX] === 1) ||
    (bx + 1 < nx && shapeEdited[ib + SX] === 1 && solid[ib + SX] === 1) ||
    (bz > 0 && shapeEdited[ib - SZ] === 1 && solid[ib - SZ] === 1) ||
    (bz + 1 < nz && shapeEdited[ib + SZ] === 1 && solid[ib + SZ] === 1)
  );
}
