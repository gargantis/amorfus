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
  // ---- GS STUDY (scratchpad) ----
  /** 'd3': §7.4 rule 2 as built. 'context': inside the D-3 zone, cap a
   *  floor's upward intrusion only under a ceiling within 2 (or beside such
   *  a column) or at the foot of a wall ≥ 2 high; cap a horizontal axis only
   *  across a 1-wide air gap; ceilings keep the D-3 cap. */
  capMode: 'd3' | 'context';
  tallFoot: boolean; // context mode: keep the upward cap at the foot of a ≥ 2-high wall
  /** pass 3 solver over R: 'jacobi' (§7.3), 'fid' (membrane + fidelity μ,
   *  iterated to tolerance), 'bilap' (thin plate + fidelity μ, FISTA to
   *  tolerance), 'mls' (windowed least-squares fit, radius r). */
  solver: 'jacobi' | 'fid' | 'bilap' | 'mls';
  mu: number;
  tol: number;
  maxIter: number;
  mlsR2: number; // squared lattice radius of the MLS window
  mlsDegree: number; // 1 = plane, 2 = quadric, 3 = adaptive plane/quadric blend
  mlsBlendLo: number; // residual ratio at or below which the quadric wins outright
  mlsBlendHi: number; // ratio at or above which the plane wins outright
  mlsDot: number; // min n0_w·N_v for a window point
  mlsRing: boolean; // ring pass for step feet and rims (plan-curve fit)
  mlsCone: boolean; // fit only the vertices whose final position the chunk needs
  postK: number; // damped Jacobi iterations after 'mls'
  /** which vertices relax: 'cell' = §7.3 R; 'all' = every vertex (study). */
  relax: 'cell' | 'all';
  /** a cell edge touching a shape-edited block crosses at its midpoint
   *  instead of interpolating ρ (an edited +1 against a weak hint skews it). */
  editMid: boolean;
  /** R also takes cells within this Chebyshev distance of an edited block
   *  (0 = §7.3). The D-3 zone itself is unchanged. */
  rDilate: number;
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
  capMode: 'd3',
  tallFoot: true,
  solver: 'jacobi',
  mu: 0,
  tol: 1e-6,
  maxIter: 4000,
  mlsR2: 25,
  mlsDegree: 2,
  mlsBlendLo: 0.2,
  mlsBlendHi: 0.5,
  mlsDot: 0,
  mlsRing: false,
  mlsCone: false,
  postK: 0,
  relax: 'cell',
  editMid: false,
  rDilate: 0,
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
  /** GS STUDY: solver statistics. */
  stats?: Record<string, number>;
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
  const vRing: number[] = []; // GS: 0 none; 1 foot (lower layer solid); 2 rim (upper layer air); 3 ceiling-foot; 4 overhang-rim

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

  // ---- GS STUDY: midpoint crossings at edits, dilated relax set ----
  const editMid = p.editMid === true;
  let editedD: Uint8Array | null = null;
  if (anyEdits && p.rDilate > 0) {
    // Chebyshev dilation of shapeEdited, separable per axis, rDilate passes
    let a = Uint8Array.from(shapeEdited);
    let b = new Uint8Array(total);
    for (let pass = 0; pass < p.rDilate; pass++) {
      for (const [stride, n] of [[SX, nx], [SZ, nz], [SY, ny]] as const) {
        b.set(a);
        for (let i = 0; i < total; i++) {
          if (a[i] !== 1) continue;
          const c = stride === SX ? i % nx : stride === SZ ? Math.floor(i / SZ) % nz : Math.floor(i / SY);
          if (c > 0) b[i - stride] = 1;
          if (c < n - 1) b[i + stride] = 1;
        }
        const t = a;
        a = b;
        b = t;
      }
    }
    editedD = a;
  }

  // ---- GS STUDY: context-aware clearance caps ----
  const ctxCaps = p.capMode === 'context';
  let statCapFreeX = 0;
  let statCapFreeUp = 0;
  /** solid at block (x,y,z); outside the region counts as air. */
  const solidAt = (x: number, y: number, z: number): number =>
    x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? 0 : solid[bi(x, y, z)]!;
  /** a 1-wide air gap along `axis` (0 = x, 2 = z) through an air block of
   *  the cell: solid on both sides. Reads blocks within 1 of the cell. */
  const gapTight = (bx: number, by: number, bz: number, axis: number): boolean => {
    const ax = axis === 0 ? 1 : 0;
    const az = axis === 2 ? 1 : 0;
    for (let oy = 0; oy < 2; oy++) {
      for (let oz = 0; oz < 2; oz++) {
        for (let ox = 0; ox < 2; ox++) {
          const x = bx + ox;
          const y = by + oy;
          const z = bz + oz;
          if (solidAt(x, y, z) === 1) continue;
          if (solidAt(x - ax, y, z - az) === 1 && solidAt(x + ax, y, z + az) === 1) return true;
        }
      }
    }
    return false;
  };
  /** headroom ≤ 2: an air block of the cell, or an air block beside one,
   *  has solid 1 or 2 above it (the D-3 zone's own reach). */
  const headTight = (bx: number, by: number, bz: number): boolean => {
    for (let oy = 0; oy < 2; oy++) {
      for (let oz = 0; oz < 2; oz++) {
        for (let ox = 0; ox < 2; ox++) {
          const x = bx + ox;
          const y = by + oy;
          const z = bz + oz;
          if (solidAt(x, y, z) === 1) continue;
          for (let k = 0; k < 5; k++) {
            const cx = x + (k === 1 ? -1 : k === 2 ? 1 : 0);
            const cz = z + (k === 3 ? -1 : k === 4 ? 1 : 0);
            if (solidAt(cx, y, cz) === 1) continue;
            if (solidAt(cx, y + 1, cz) === 1 || solidAt(cx, y + 2, cz) === 1) return true;
          }
        }
      }
    }
    return false;
  };
  /** foot of a wall ≥ 2 high: the cell's upper layer holds air and a solid
   *  block with solid directly above it. Keeps 2-block rises unwalkable. */
  const tallFoot = (bx: number, by: number, bz: number): boolean => {
    let air = false;
    let tall = false;
    for (let oz = 0; oz < 2; oz++) {
      for (let ox = 0; ox < 2; ox++) {
        if (solidAt(bx + ox, by + 1, bz + oz) === 0) air = true;
        else if (solidAt(bx + ox, by + 2, bz + oz) === 1) tall = true;
      }
    }
    return air && tall;
  };

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
        let inRelax = inR;
        if (editedD !== null && inRelax === 0) {
          if (
            editedD[i000] === 1 || editedD[i100] === 1 || editedD[i001] === 1 ||
            editedD[i101] === 1 || editedD[i010] === 1 || editedD[i110] === 1 ||
            editedD[i011] === 1 || editedD[i111] === 1
          ) {
            inRelax = 1;
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
            const midE = editMid && (shapeEdited[i000] === 1 || shapeEdited[i100] === 1);
            const r0 = s000 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s000 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += -0.5 + t;
            sy += -0.5;
            sz += -0.5;
            crossings += 1;
          }
        }
        if (s000 !== s010) {
          if (s000 === 1 ? sharpSolid[i000]! === 1 : sharpSolid[i010]! === 1) pin1 = true;
          {
            const r0raw = rho[i000]!;
            const r1raw = rho[i010]!;
            const midE = editMid && (shapeEdited[i000] === 1 || shapeEdited[i010] === 1);
            const r0 = s000 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s000 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += -0.5;
            sy += -0.5 + t;
            sz += -0.5;
            crossings += 1;
          }
        }
        if (s000 !== s001) {
          if (s000 === 1 ? sharpSolid[i000]! === 1 : sharpSolid[i001]! === 1) pin2 = true;
          {
            const r0raw = rho[i000]!;
            const r1raw = rho[i001]!;
            const midE = editMid && (shapeEdited[i000] === 1 || shapeEdited[i001] === 1);
            const r0 = s000 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s000 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += -0.5;
            sy += -0.5;
            sz += -0.5 + t;
            crossings += 1;
          }
        }
        if (s100 !== s110) {
          if (s100 === 1 ? sharpSolid[i100]! === 1 : sharpSolid[i110]! === 1) pin1 = true;
          {
            const r0raw = rho[i100]!;
            const r1raw = rho[i110]!;
            const midE = editMid && (shapeEdited[i100] === 1 || shapeEdited[i110] === 1);
            const r0 = s100 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s100 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += 0.5;
            sy += -0.5 + t;
            sz += -0.5;
            crossings += 1;
          }
        }
        if (s100 !== s101) {
          if (s100 === 1 ? sharpSolid[i100]! === 1 : sharpSolid[i101]! === 1) pin2 = true;
          {
            const r0raw = rho[i100]!;
            const r1raw = rho[i101]!;
            const midE = editMid && (shapeEdited[i100] === 1 || shapeEdited[i101] === 1);
            const r0 = s100 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s100 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += 0.5;
            sy += -0.5;
            sz += -0.5 + t;
            crossings += 1;
          }
        }
        if (s001 !== s101) {
          if (s001 === 1 ? sharpSolid[i001]! === 1 : sharpSolid[i101]! === 1) pin0 = true;
          {
            const r0raw = rho[i001]!;
            const r1raw = rho[i101]!;
            const midE = editMid && (shapeEdited[i001] === 1 || shapeEdited[i101] === 1);
            const r0 = s001 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s001 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += -0.5 + t;
            sy += -0.5;
            sz += 0.5;
            crossings += 1;
          }
        }
        if (s001 !== s011) {
          if (s001 === 1 ? sharpSolid[i001]! === 1 : sharpSolid[i011]! === 1) pin1 = true;
          {
            const r0raw = rho[i001]!;
            const r1raw = rho[i011]!;
            const midE = editMid && (shapeEdited[i001] === 1 || shapeEdited[i011] === 1);
            const r0 = s001 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s001 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += -0.5;
            sy += -0.5 + t;
            sz += 0.5;
            crossings += 1;
          }
        }
        if (s101 !== s111) {
          if (s101 === 1 ? sharpSolid[i101]! === 1 : sharpSolid[i111]! === 1) pin1 = true;
          {
            const r0raw = rho[i101]!;
            const r1raw = rho[i111]!;
            const midE = editMid && (shapeEdited[i101] === 1 || shapeEdited[i111] === 1);
            const r0 = s101 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s101 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += 0.5;
            sy += -0.5 + t;
            sz += 0.5;
            crossings += 1;
          }
        }
        if (s010 !== s110) {
          if (s010 === 1 ? sharpSolid[i010]! === 1 : sharpSolid[i110]! === 1) pin0 = true;
          {
            const r0raw = rho[i010]!;
            const r1raw = rho[i110]!;
            const midE = editMid && (shapeEdited[i010] === 1 || shapeEdited[i110] === 1);
            const r0 = s010 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s010 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += -0.5 + t;
            sy += 0.5;
            sz += -0.5;
            crossings += 1;
          }
        }
        if (s010 !== s011) {
          if (s010 === 1 ? sharpSolid[i010]! === 1 : sharpSolid[i011]! === 1) pin2 = true;
          {
            const r0raw = rho[i010]!;
            const r1raw = rho[i011]!;
            const midE = editMid && (shapeEdited[i010] === 1 || shapeEdited[i011] === 1);
            const r0 = s010 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s010 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += -0.5;
            sy += 0.5;
            sz += -0.5 + t;
            crossings += 1;
          }
        }
        if (s110 !== s111) {
          if (s110 === 1 ? sharpSolid[i110]! === 1 : sharpSolid[i111]! === 1) pin2 = true;
          {
            const r0raw = rho[i110]!;
            const r1raw = rho[i111]!;
            const midE = editMid && (shapeEdited[i110] === 1 || shapeEdited[i111] === 1);
            const r0 = s110 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s110 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += 0.5;
            sy += 0.5;
            sz += -0.5 + t;
            crossings += 1;
          }
        }
        if (s011 !== s111) {
          if (s011 === 1 ? sharpSolid[i011]! === 1 : sharpSolid[i111]! === 1) pin0 = true;
          {
            const r0raw = rho[i011]!;
            const r1raw = rho[i111]!;
            const midE = editMid && (shapeEdited[i011] === 1 || shapeEdited[i111] === 1);
            const r0 = s011 === 1 ? (r0raw > 1e-6 ? r0raw : 1e-6) : (r0raw < -1e-6 ? r0raw : -1e-6);
            const r1 = s011 === 1 ? (r1raw < -1e-6 ? r1raw : -1e-6) : (r1raw > 1e-6 ? r1raw : 1e-6);
            const t = midE ? 0.5 : r0 / (r0 - r1);
            sx += -0.5 + t;
            sy += 0.5;
            sz += 0.5;
            crossings += 1;
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
            // GS STUDY: in 'context' mode each cap applies only where the
            // opening it protects is actually tight (see MeshParams).
            let capX = true;
            let capUp = true;
            let capZ = true;
            if (ctxCaps) {
              capX = gapTight(bxc, byc, bzc, 0);
              capZ = gapTight(bxc, byc, bzc, 2);
              capUp = headTight(bxc, byc, bzc) || (p.tallFoot && tallFoot(bxc, byc, bzc));
              if (!capX) statCapFreeX++;
              if (!capUp) statCapFreeUp++;
            }
            const plusX = s100 + s101 + s110 + s111;
            const minusX = s000 + s001 + s010 + s011;
            if (capX && plusX <= minusX && capH < hi0) hi0 = capH;
            if (capX && minusX <= plusX && -capH > lo0) lo0 = -capH;
            const plusY = s010 + s110 + s011 + s111;
            const minusY = s000 + s100 + s001 + s101;
            if (capUp && plusY <= minusY && capV < hi1) hi1 = capV;
            if (minusY <= plusY && -capV > lo1) lo1 = -capV;
            const plusZ = s001 + s101 + s011 + s111;
            const minusZ = s000 + s100 + s010 + s110;
            if (capZ && plusZ <= minusZ && capH < hi2) hi2 = capH;
            if (capZ && minusZ <= plusZ && -capH > lo2) lo2 = -capH;
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
        vInR.push(inRelax);
        {
          const nL = s000 + s100 + s001 + s101;
          const nU = s010 + s110 + s011 + s111;
          let ring = 0;
          if (nL === 4 && nU > 0 && nU < 4) ring = 1;
          else if (nU === 0 && nL > 0 && nL < 4) ring = 2;
          else if (nU === 4 && nL > 0 && nL < 4) ring = 3;
          else if (nL === 0 && nU > 0 && nU < 4) ring = 4;
          vRing.push(ring);
        }
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
  const stats: Record<string, number> = { capFreeX: statCapFreeX, capFreeUp: statCapFreeUp };
  if (!p.forceZeroOffsets && !bevelMode && p.solver !== 'jacobi') {
    const rList: number[] = [];
    for (let v = 0; v < vertCount; v++) if (vInR[v] === 1 || p.relax === 'all') rList.push(v);
    stats.R = rList.length;
    if (rList.length > 0) {
      const t0 = performance.now();
      if (p.solver === 'fid') {
        stats.iters = relaxMembrane(d, rList, neigh, vcx, vcy, vcz, lo, hi, p.lambda, p.mu, p.tol, p.maxIter);
      } else if (p.solver === 'bilap') {
        stats.iters = relaxThinPlate(d, rList, vertCount, neigh, vcx, vcy, vcz, lo, hi, p.mu, p.tol, p.maxIter);
      } else if (p.solver === 'mls') {
        // Only vertices the chunk needs: final positions of corners
        // [−1, 33] (chunk-local) feed the emitted vertices and their
        // normals; postK Jacobi steps widen that by one per step.
        const K = p.postK;
        const inCone = (v: number, m: number): boolean => {
          const lx = vcx[v]! - apron;
          const ly = vcy[v]! - apron;
          const lz = vcz[v]! - apron;
          return lx >= -1 - m && lx <= 33 + m && ly >= -1 - m && ly <= 33 + m && lz >= -1 - m && lz <= 33 + m;
        };
        const fitList = p.mlsCone ? rList.filter((v) => inCone(v, K)) : rList;
        stats.fitted = fitList.length;
        const r = p.mlsDegree === 2 && !p.mlsRing
          ? mlsFitQ(d, fitList, vertCount, neigh, vcx, vcy, vcz, lo, hi, qa, qmeta, quadTotal, p)
          : mlsFit(d, fitList, vertCount, neigh, vcx, vcy, vcz, lo, hi, qa, qmeta, quadTotal, p, vRing);
        stats.ringFits = r.ringFits;
        stats.mlsSkipped = r.skipped;
        stats.mlsDegraded = r.degraded;
        stats.mlsPoints = r.points;
        if (K > 0) {
          if (p.mlsCone) {
            // shrinking cone: step i updates [−1 − (K − i), 33 + (K − i)]
            for (let i = 1; i <= K; i++) {
              const list = rList.filter((v) => inCone(v, K - i));
              relaxMembrane(d, list, neigh, vcx, vcy, vcz, lo, hi, p.lambda, 0, -1, 1);
            }
          } else {
            relaxMembrane(d, rList, neigh, vcx, vcy, vcz, lo, hi, p.lambda, 0, -1, K);
          }
        }
      }
      stats.ms = performance.now() - t0;
    }
  }
  if (!p.forceZeroOffsets && p.k > 0 && !bevelMode && p.solver === 'jacobi') {
    const rList: number[] = [];
    for (let v = 0; v < vertCount; v++) if (vInR[v] === 1 || p.relax === 'all') rList.push(v);
    stats.R = rList.length;
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
    const ao8 = Math.round(aoOf(v) * 255);
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
    stats,
  };
}

// ======================================================================
// GS STUDY solvers. All are pure functions of (d, box, graph) with a fixed
// visiting order and only + − × ÷ √ and comparisons.

/** Damped Jacobi on the membrane with fidelity μ toward the starting
 *  offsets: t = (Σ(e_vw + d_w) + μ·d⁰_v)/(n + μ), d ← clamp(d + λ(t − d)).
 *  Iterates until max |Δd| < tol (tol < 0: exactly maxIter iterations).
 *  Returns the iteration count. */
function relaxMembrane(
  d: Float64Array, rList: number[], neigh: Int32Array,
  vcx: number[], vcy: number[], vcz: number[],
  lo: Float64Array, hi: Float64Array,
  lambda: number, mu: number, tol: number, maxIter: number,
): number {
  const d0 = d.slice();
  let cur = d;
  let next = d.slice();
  let iter = 0;
  for (; iter < maxIter; iter++) {
    if (iter > 0) next.set(cur);
    let maxDelta = 0;
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
      const den = count + mu;
      const tx = (mx + mu * d0[v * 3]!) / den;
      const ty = (my + mu * d0[v * 3 + 1]!) / den;
      const tz = (mz + mu * d0[v * 3 + 2]!) / den;
      const a0 = cur[v * 3]!;
      const a1 = cur[v * 3 + 1]!;
      const a2 = cur[v * 3 + 2]!;
      const n0 = clampf(a0 + lambda * (tx - a0), lo[v * 3]!, hi[v * 3]!);
      const n1 = clampf(a1 + lambda * (ty - a1), lo[v * 3 + 1]!, hi[v * 3 + 1]!);
      const n2 = clampf(a2 + lambda * (tz - a2), lo[v * 3 + 2]!, hi[v * 3 + 2]!);
      next[v * 3] = n0;
      next[v * 3 + 1] = n1;
      next[v * 3 + 2] = n2;
      const m0 = n0 > a0 ? n0 - a0 : a0 - n0;
      const m1 = n1 > a1 ? n1 - a1 : a1 - n1;
      const m2 = n2 > a2 ? n2 - a2 : a2 - n2;
      if (m0 > maxDelta) maxDelta = m0;
      if (m1 > maxDelta) maxDelta = m1;
      if (m2 > maxDelta) maxDelta = m2;
    }
    const tmp = cur;
    cur = next;
    next = tmp;
    if (tol >= 0 && maxDelta < tol) {
      iter += 1;
      break;
    }
  }
  if (cur !== d) d.set(cur);
  return iter;
}

/** Thin plate (umbrella of umbrella) with fidelity μ, box-constrained,
 *  minimised by accelerated projected gradient (FISTA):
 *  E = Σ_v |U_v|² + μ Σ_{v∈R} |d_v − d⁰_v|², U_v = mean_w(e_vw + d_w) − d_v.
 *  Only R moves; U is evaluated on every vertex (non-R ones feel R
 *  neighbours). Returns the iteration count. */
function relaxThinPlate(
  d: Float64Array, rList: number[], vertCount: number, neigh: Int32Array,
  vcx: number[], vcy: number[], vcz: number[],
  lo: Float64Array, hi: Float64Array,
  mu: number, tol: number, maxIter: number,
): number {
  const inR = new Uint8Array(vertCount);
  for (const v of rList) inR[v] = 1;
  // vertices whose U depends on R: R and its 1-ring
  const uSet: number[] = [];
  const mark = new Uint8Array(vertCount);
  for (const v of rList) {
    if (!mark[v]) { mark[v] = 1; uSet.push(v); }
    for (let s = 0; s < 6; s++) {
      const w = neigh[v * 6 + s]!;
      if (w >= 0 && !mark[w]) { mark[w] = 1; uSet.push(w); }
    }
  }
  uSet.sort((a, b) => a - b);
  const deg = new Float64Array(vertCount);
  for (const v of uSet) {
    let c = 0;
    for (let s = 0; s < 6; s++) if (neigh[v * 6 + s]! >= 0) c += 1;
    deg[v] = c;
  }
  const d0 = d.slice();
  const x = d.slice();
  const y = d.slice();
  const U = new Float64Array(vertCount * 3);
  const L = 2 * (4 + mu);
  let t = 1;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    // U at y
    for (const v of uSet) {
      const n = deg[v]!;
      if (n === 0) continue;
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (let s = 0; s < 6; s++) {
        const w = neigh[v * 6 + s]!;
        if (w < 0) continue;
        mx += vcx[w]! - vcx[v]! + y[w * 3]!;
        my += vcy[w]! - vcy[v]! + y[w * 3 + 1]!;
        mz += vcz[w]! - vcz[v]! + y[w * 3 + 2]!;
      }
      U[v * 3] = mx / n - y[v * 3]!;
      U[v * 3 + 1] = my / n - y[v * 3 + 1]!;
      U[v * 3 + 2] = mz / n - y[v * 3 + 2]!;
    }
    const tNext = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    const beta = (t - 1) / tNext;
    let maxDelta = 0;
    // gradient step for R (x_new), written to y after momentum
    const xNew = new Float64Array(rList.length * 3);
    for (let i = 0; i < rList.length; i++) {
      const v = rList[i]!;
      for (let a = 0; a < 3; a++) {
        let g = -U[v * 3 + a]!;
        for (let s = 0; s < 6; s++) {
          const w = neigh[v * 6 + s]!;
          if (w < 0 || deg[w]! === 0) continue;
          g += U[w * 3 + a]! / deg[w]!;
        }
        g = 2 * (g + mu * (y[v * 3 + a]! - d0[v * 3 + a]!));
        const xn = clampf(y[v * 3 + a]! - g / L, lo[v * 3 + a]!, hi[v * 3 + a]!);
        xNew[i * 3 + a] = xn;
      }
    }
    for (let i = 0; i < rList.length; i++) {
      const v = rList[i]!;
      for (let a = 0; a < 3; a++) {
        const xn = xNew[i * 3 + a]!;
        const xo = x[v * 3 + a]!;
        const dd = xn > xo ? xn - xo : xo - xn;
        if (dd > maxDelta) maxDelta = dd;
        x[v * 3 + a] = xn;
        y[v * 3 + a] = xn + beta * (xn - xo);
      }
    }
    t = tNext;
    if (maxDelta < tol) {
      iter += 1;
      break;
    }
  }
  for (const v of rList) {
    d[v * 3] = x[v * 3]!;
    d[v * 3 + 1] = x[v * 3 + 1]!;
    d[v * 3 + 2] = x[v * 3 + 2]!;
  }
  return iter;
}

/** Windowed least-squares surface fit (MLS) — a converged solve of a
 *  problem posed on a world-anchored window: for each R vertex v, the
 *  mesh-connected vertices w with |c_w − c_v|² ≤ r² (lattice corners,
 *  exact integers) fit a height field h(u, s) of degree 1 or 2 in the frame
 *  of the window's weighted normal, with weights (1 − |c_w − c_v|²/r²)²;
 *  v moves along that normal onto h(0, 0), then into its box. Every input
 *  is a pure function of the blocks within r + 1 (+ the box's own reach)
 *  of c_v, so both chunks of a seam compute it identically. */
function mlsFit(
  d: Float64Array, rList: number[], vertCount: number, neigh: Int32Array,
  vcx: number[], vcy: number[], vcz: number[],
  lo: Float64Array, hi: Float64Array,
  qa: number[], qmeta: number[], quadTotal: number,
  p: MeshParams,
  vRing: number[],
): { skipped: number; degraded: number; points: number; ringFits: number } {
  let ringFits = 0;
  const ringQueue: number[] = [];
  const ringStamp = new Int32Array(vertCount).fill(-1);
  const A3 = new Float64Array(36);
  const B3 = new Float64Array(6);
  const R2 = p.mlsR2;
  // positions and area-weighted normals at the starting offsets
  const P = new Float64Array(vertCount * 3);
  for (let v = 0; v < vertCount; v++) {
    P[v * 3] = vcx[v]! + d[v * 3]!;
    P[v * 3 + 1] = vcy[v]! + d[v * 3 + 1]!;
    P[v * 3 + 2] = vcz[v]! + d[v * 3 + 2]!;
  }
  const N0 = new Float64Array(vertCount * 3);
  for (let q = 0; q < quadTotal; q++) {
    const meta = qmeta[q]!;
    const axis = meta & 3;
    const solidIsLower = (meta & 4) !== 0;
    const a = qa[q * 4]!;
    const b = qa[q * 4 + 1]!;
    const c = qa[q * 4 + 2]!;
    const e = qa[q * 4 + 3]!;
    const abx = P[b * 3]! - P[a * 3]!;
    const aby = P[b * 3 + 1]! - P[a * 3 + 1]!;
    const abz = P[b * 3 + 2]! - P[a * 3 + 2]!;
    const acx = P[c * 3]! - P[a * 3]!;
    const acy = P[c * 3 + 1]! - P[a * 3 + 1]!;
    const acz = P[c * 3 + 2]! - P[a * 3 + 2]!;
    const adx = P[e * 3]! - P[a * 3]!;
    const ady = P[e * 3 + 1]! - P[a * 3 + 1]!;
    const adz = P[e * 3 + 2]! - P[a * 3 + 2]!;
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
    for (const v of [a, b, c, e]) {
      N0[v * 3] = N0[v * 3]! + nxx;
      N0[v * 3 + 1] = N0[v * 3 + 1]! + nyy;
      N0[v * 3 + 2] = N0[v * 3 + 2]! + nzz;
    }
  }
  for (let v = 0; v < vertCount; v++) {
    const l = Math.sqrt(N0[v * 3]! * N0[v * 3]! + N0[v * 3 + 1]! * N0[v * 3 + 1]! + N0[v * 3 + 2]! * N0[v * 3 + 2]!);
    if (l > 1e-12) {
      N0[v * 3] = N0[v * 3]! / l;
      N0[v * 3 + 1] = N0[v * 3 + 1]! / l;
      N0[v * 3 + 2] = N0[v * 3 + 2]! / l;
    }
  }
  const out = d.slice();
  const stamp = new Int32Array(vertCount).fill(-1);
  const queue: number[] = [];
  const deg2 = p.mlsDegree >= 2;
  const A = new Float64Array(36);
  const B = new Float64Array(6);
  const basis = new Float64Array(6);
  let skipped = 0;
  let degraded = 0;
  let points = 0;
  for (let ri = 0; ri < rList.length; ri++) {
    const v = rList[ri]!;
    const cx = vcx[v]!;
    const cy = vcy[v]!;
    const cz = vcz[v]!;
    // connected window: BFS over mesh edges, staying inside the ball
    queue.length = 0;
    queue.push(v);
    stamp[v] = ri;
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi]!;
      for (let s = 0; s < 6; s++) {
        const w = neigh[u * 6 + s]!;
        if (w < 0 || stamp[w] === ri) continue;
        const ex = vcx[w]! - cx;
        const ey = vcy[w]! - cy;
        const ez = vcz[w]! - cz;
        if (ex * ex + ey * ey + ez * ez >= R2) continue;
        stamp[w] = ri;
        queue.push(w);
      }
    }
    // window normal: weighted mean of the starting normals
    let Nx = 0;
    let Ny = 0;
    let Nz = 0;
    for (const w of queue) {
      const ex = vcx[w]! - cx;
      const ey = vcy[w]! - cy;
      const ez = vcz[w]! - cz;
      const f = 1 - (ex * ex + ey * ey + ez * ez) / R2;
      const om = f * f;
      Nx += om * N0[w * 3]!;
      Ny += om * N0[w * 3 + 1]!;
      Nz += om * N0[w * 3 + 2]!;
    }
    const nl = Math.sqrt(Nx * Nx + Ny * Ny + Nz * Nz);
    if (nl < 1e-9) {
      skipped += 1;
      continue;
    }
    Nx /= nl;
    Ny /= nl;
    Nz /= nl;
    // tangent frame: the lattice axis least aligned with N, orthogonalised
    const ax = Nx < 0 ? -Nx : Nx;
    const ay = Ny < 0 ? -Ny : Ny;
    const az = Nz < 0 ? -Nz : Nz;
    let ex0 = 0;
    let ey0 = 0;
    let ez0 = 0;
    if (ax <= ay && ax <= az) ex0 = 1;
    else if (ay <= az) ey0 = 1;
    else ez0 = 1;
    const dn = ex0 * Nx + ey0 * Ny + ez0 * Nz;
    let t1x = ex0 - dn * Nx;
    let t1y = ey0 - dn * Ny;
    let t1z = ez0 - dn * Nz;
    const tl = Math.sqrt(t1x * t1x + t1y * t1y + t1z * t1z);
    t1x /= tl;
    t1y /= tl;
    t1z /= tl;
    const t2x = Ny * t1z - Nz * t1y;
    const t2y = Nz * t1x - Nx * t1z;
    const t2z = Nx * t1y - Ny * t1x;
    // weighted normal equations
    const nb = deg2 ? 6 : 3; // degree 3 (adaptive) accumulates the full 6×6
    A.fill(0);
    B.fill(0);
    const px = P[v * 3]!;
    const py = P[v * 3 + 1]!;
    const pz = P[v * 3 + 2]!;
    let used = 0;
    let Shh = 0;
    for (const w of queue) {
      const dot = N0[w * 3]! * Nx + N0[w * 3 + 1]! * Ny + N0[w * 3 + 2]! * Nz;
      if (dot < p.mlsDot) continue;
      const ex = vcx[w]! - cx;
      const ey = vcy[w]! - cy;
      const ez = vcz[w]! - cz;
      const f = 1 - (ex * ex + ey * ey + ez * ez) / R2;
      const om = f * f;
      const qx = P[w * 3]! - px;
      const qy = P[w * 3 + 1]! - py;
      const qz = P[w * 3 + 2]! - pz;
      const u = qx * t1x + qy * t1y + qz * t1z;
      const s = qx * t2x + qy * t2y + qz * t2z;
      const h = qx * Nx + qy * Ny + qz * Nz;
      basis[0] = 1;
      basis[1] = u;
      basis[2] = s;
      if (deg2) {
        basis[3] = u * u;
        basis[4] = u * s;
        basis[5] = s * s;
      }
      for (let i = 0; i < nb; i++) {
        const bi = om * basis[i]!;
        B[i] = B[i]! + bi * h;
        for (let j = 0; j < nb; j++) A[i * 6 + j] = A[i * 6 + j]! + bi * basis[j]!;
      }
      Shh += om * h * h;
      used += 1;
    }
    points += used;
    let h0: number | null = null;
    if (p.mlsDegree === 3) {
      // adaptive: blend plane and quadric by how much the quadric explains.
      // A staircase standing in for a plane leaves the quadric little to
      // add (ratio near 1); a curved shape leaves the plane a large residual
      // (ratio near 0).
      const cp = solveAll(A, B, 3);
      const cq = solveAll(A, B, 6);
      if (cp !== null && cq !== null) {
        const rssP = Shh - (cp[0]! * B[0]! + cp[1]! * B[1]! + cp[2]! * B[2]!);
        let rssQ = Shh;
        for (let i = 0; i < 6; i++) rssQ -= cq[i]! * B[i]!;
        const ratio = rssP > 1e-12 ? rssQ / rssP : 1;
        let wPlane = (ratio - p.mlsBlendLo) / (p.mlsBlendHi - p.mlsBlendLo);
        wPlane = wPlane < 0 ? 0 : wPlane > 1 ? 1 : wPlane;
        h0 = wPlane * cp[0]! + (1 - wPlane) * cq[0]!;
        const dbg = (globalThis as { __GS_RATIOS?: number[] }).__GS_RATIOS;
        if (dbg) dbg.push(ratio);
      } else if (cp !== null) {
        degraded += 1;
        h0 = cp[0]!;
      }
    } else {
      const c = solveAll(A, B, nb);
      if (c !== null) h0 = c[0]!;
      else if (deg2) {
        degraded += 1;
        const c3 = solveAll(A, B, 3);
        if (c3 !== null) h0 = c3[0]!;
      }
    }
    if (h0 === null) {
      skipped += 1;
      continue;
    }
    let dx = h0 * Nx;
    const dy = h0 * Ny;
    let dz = h0 * Nz;
    // GS ring pass: a foot or rim vertex of a horizontal step also fits the
    // plan curve of its same-height ring (same window, so no extra reach)
    // and takes the in-plan normal component of its move from that curve.
    const ring = p.mlsRing ? vRing[v]! : 0;
    if (ring !== 0) {
      ringQueue.length = 0;
      ringQueue.push(v);
      ringStamp[v] = ri;
      for (let qi = 0; qi < ringQueue.length; qi++) {
        const u = ringQueue[qi]!;
        for (const sl of [0, 1, 4, 5]) {
          const w = neigh[u * 6 + sl]!;
          if (w < 0 || ringStamp[w] === ri || vRing[w] !== ring) continue;
          const ex = vcx[w]! - cx;
          const ez = vcz[w]! - cz;
          if (ex * ex + ez * ez >= R2) continue;
          ringStamp[w] = ri;
          ringQueue.push(w);
        }
      }
      if (ringQueue.length >= 4) {
        // plan normal: weighted mean of the horizontal parts of N0
        let gx = 0;
        let gz = 0;
        for (const w of ringQueue) {
          const ex = vcx[w]! - cx;
          const ez = vcz[w]! - cz;
          const f = 1 - (ex * ex + ez * ez) / R2;
          gx += f * f * N0[w * 3]!;
          gz += f * f * N0[w * 3 + 2]!;
        }
        const gl = Math.sqrt(gx * gx + gz * gz);
        if (gl > 1e-6) {
          gx /= gl;
          gz /= gl;
          const tx = -gz;
          const tz = gx;
          A3.fill(0);
          B3.fill(0);
          for (const w of ringQueue) {
            const ex = vcx[w]! - cx;
            const ez = vcz[w]! - cz;
            const f = 1 - (ex * ex + ez * ez) / R2;
            const om = f * f;
            const qx = P[w * 3]! - px;
            const qz = P[w * 3 + 2]! - pz;
            const uu = qx * tx + qz * tz;
            const hh = qx * gx + qz * gz;
            basis[0] = 1;
            basis[1] = uu;
            basis[2] = uu * uu;
            for (let i = 0; i < 3; i++) {
              const bi = om * basis[i]!;
              B3[i] = B3[i]! + bi * hh;
              for (let j = 0; j < 3; j++) A3[i * 6 + j] = A3[i * 6 + j]! + bi * basis[j]!;
            }
          }
          let c = solveAll(A3, B3, 3);
          if (c === null) c = solveAll(A3, B3, 2);
          if (c !== null) {
            const a = c[0]!;
            const along = dx * gx + dz * gz;
            dx += (a - along) * gx;
            dz += (a - along) * gz;
            ringFits += 1;
          }
        }
      }
    }
    out[v * 3] = clampf(d[v * 3]! + dx, lo[v * 3]!, hi[v * 3]!);
    out[v * 3 + 1] = clampf(d[v * 3 + 1]! + dy, lo[v * 3 + 1]!, hi[v * 3 + 1]!);
    out[v * 3 + 2] = clampf(d[v * 3 + 2]! + dz, lo[v * 3 + 2]!, hi[v * 3 + 2]!);
  }
  d.set(out);
  return { skipped, degraded, points, ringFits };
}

/** mlsFit, degree 2 only, optimised: moments instead of a 6×6 outer
 *  product per point, weights computed once, typed scratch, no allocation
 *  in the vertex loop. Same mathematics (summation order differs). */
function mlsFitQ(
  d: Float64Array, rList: number[], vertCount: number, neigh: Int32Array,
  vcx: number[], vcy: number[], vcz: number[],
  lo: Float64Array, hi: Float64Array,
  qa: number[], qmeta: number[], quadTotal: number,
  p: MeshParams,
): { skipped: number; degraded: number; points: number; ringFits: number } {
  const R2 = p.mlsR2;
  const dotMin = p.mlsDot;
  // starting positions and normals, only where a window can reach: mark
  // vertices within the window radius of R by a BFS-free bound — every
  // vertex whose corner is within the ball of some R vertex. Cheaper: all.
  const P = new Float64Array(vertCount * 3);
  for (let v = 0; v < vertCount; v++) {
    P[v * 3] = vcx[v]! + d[v * 3]!;
    P[v * 3 + 1] = vcy[v]! + d[v * 3 + 1]!;
    P[v * 3 + 2] = vcz[v]! + d[v * 3 + 2]!;
  }
  const N0 = new Float64Array(vertCount * 3);
  for (let q = 0; q < quadTotal; q++) {
    const meta = qmeta[q]!;
    const axis = meta & 3;
    const a = qa[q * 4]! * 3;
    const b = qa[q * 4 + 1]! * 3;
    const c = qa[q * 4 + 2]! * 3;
    const e = qa[q * 4 + 3]! * 3;
    const abx = P[b]! - P[a]!;
    const aby = P[b + 1]! - P[a + 1]!;
    const abz = P[b + 2]! - P[a + 2]!;
    const acx = P[c]! - P[a]!;
    const acy = P[c + 1]! - P[a + 1]!;
    const acz = P[c + 2]! - P[a + 2]!;
    const adx = P[e]! - P[a]!;
    const ady = P[e + 1]! - P[a + 1]!;
    const adz = P[e + 2]! - P[a + 2]!;
    let nxx = aby * acz - abz * acy + (acy * adz - acz * ady);
    let nyy = abz * acx - abx * acz + (acz * adx - acx * adz);
    let nzz = abx * acy - aby * acx + (acx * ady - acy * adx);
    const dirDot = axis === 0 ? nxx : axis === 1 ? nyy : nzz;
    if ((meta & 4) !== 0 ? dirDot < 0 : dirDot > 0) {
      nxx = -nxx;
      nyy = -nyy;
      nzz = -nzz;
    }
    N0[a] = N0[a]! + nxx; N0[a + 1] = N0[a + 1]! + nyy; N0[a + 2] = N0[a + 2]! + nzz;
    N0[b] = N0[b]! + nxx; N0[b + 1] = N0[b + 1]! + nyy; N0[b + 2] = N0[b + 2]! + nzz;
    N0[c] = N0[c]! + nxx; N0[c + 1] = N0[c + 1]! + nyy; N0[c + 2] = N0[c + 2]! + nzz;
    N0[e] = N0[e]! + nxx; N0[e + 1] = N0[e + 1]! + nyy; N0[e + 2] = N0[e + 2]! + nzz;
  }
  for (let i = 0; i < vertCount * 3; i += 3) {
    const l = Math.sqrt(N0[i]! * N0[i]! + N0[i + 1]! * N0[i + 1]! + N0[i + 2]! * N0[i + 2]!);
    if (l > 1e-12) {
      N0[i] = N0[i]! / l;
      N0[i + 1] = N0[i + 1]! / l;
      N0[i + 2] = N0[i + 2]! / l;
    }
  }
  const out = d.slice();
  const stamp = new Int32Array(vertCount).fill(-1);
  let cap = 1024;
  let qv = new Int32Array(cap);
  let qw = new Float64Array(cap);
  const A = new Float64Array(36);
  const B = new Float64Array(6);
  let skipped = 0;
  let degraded = 0;
  let points = 0;
  for (let ri = 0; ri < rList.length; ri++) {
    const v = rList[ri]!;
    const cx = vcx[v]!;
    const cy = vcy[v]!;
    const cz = vcz[v]!;
    let qn = 1;
    qv[0] = v;
    qw[0] = 1;
    stamp[v] = ri;
    let Nx = N0[v * 3]!;
    let Ny = N0[v * 3 + 1]!;
    let Nz = N0[v * 3 + 2]!;
    for (let qi = 0; qi < qn; qi++) {
      const u6 = qv[qi]! * 6;
      for (let sl = 0; sl < 6; sl++) {
        const w = neigh[u6 + sl]!;
        if (w < 0 || stamp[w] === ri) continue;
        const ex = vcx[w]! - cx;
        const ey = vcy[w]! - cy;
        const ez = vcz[w]! - cz;
        const r2 = ex * ex + ey * ey + ez * ez;
        if (r2 >= R2) continue;
        stamp[w] = ri;
        if (qn === cap) {
          cap *= 2;
          const nv = new Int32Array(cap);
          nv.set(qv);
          qv = nv;
          const nw = new Float64Array(cap);
          nw.set(qw);
          qw = nw;
        }
        const f = 1 - r2 / R2;
        const om = f * f;
        qv[qn] = w;
        qw[qn] = om;
        qn += 1;
        Nx += om * N0[w * 3]!;
        Ny += om * N0[w * 3 + 1]!;
        Nz += om * N0[w * 3 + 2]!;
      }
    }
    const nl = Math.sqrt(Nx * Nx + Ny * Ny + Nz * Nz);
    if (nl < 1e-9) {
      skipped += 1;
      continue;
    }
    Nx /= nl;
    Ny /= nl;
    Nz /= nl;
    const ax = Nx < 0 ? -Nx : Nx;
    const ay = Ny < 0 ? -Ny : Ny;
    const az = Nz < 0 ? -Nz : Nz;
    let ex0 = 0;
    let ey0 = 0;
    let ez0 = 0;
    if (ax <= ay && ax <= az) ex0 = 1;
    else if (ay <= az) ey0 = 1;
    else ez0 = 1;
    const dn = ex0 * Nx + ey0 * Ny + ez0 * Nz;
    let t1x = ex0 - dn * Nx;
    let t1y = ey0 - dn * Ny;
    let t1z = ez0 - dn * Nz;
    const tl = Math.sqrt(t1x * t1x + t1y * t1y + t1z * t1z);
    t1x /= tl;
    t1y /= tl;
    t1z /= tl;
    const t2x = Ny * t1z - Nz * t1y;
    const t2y = Nz * t1x - Nx * t1z;
    const t2z = Nx * t1y - Ny * t1x;
    const px = P[v * 3]!;
    const py = P[v * 3 + 1]!;
    const pz = P[v * 3 + 2]!;
    let m00 = 0, m10 = 0, m01 = 0, m20 = 0, m11 = 0, m02 = 0;
    let m30 = 0, m21 = 0, m12 = 0, m03 = 0, m40 = 0, m31 = 0, m22 = 0, m13 = 0, m04 = 0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    let used = 0;
    for (let k = 0; k < qn; k++) {
      const w3 = qv[k]! * 3;
      if (N0[w3]! * Nx + N0[w3 + 1]! * Ny + N0[w3 + 2]! * Nz < dotMin) continue;
      const om = qw[k]!;
      const qx = P[w3]! - px;
      const qy = P[w3 + 1]! - py;
      const qz = P[w3 + 2]! - pz;
      const u = qx * t1x + qy * t1y + qz * t1z;
      const s = qx * t2x + qy * t2y + qz * t2z;
      const h = qx * Nx + qy * Ny + qz * Nz;
      const ou = om * u;
      const os = om * s;
      const ouu = ou * u;
      const ous = ou * s;
      const oss = os * s;
      m00 += om; m10 += ou; m01 += os;
      m20 += ouu; m11 += ous; m02 += oss;
      m30 += ouu * u; m21 += ouu * s; m12 += oss * u; m03 += oss * s;
      m40 += ouu * u * u; m31 += ouu * u * s; m22 += ouu * s * s; m13 += oss * s * u; m04 += oss * s * s;
      b0 += om * h; b1 += ou * h; b2 += os * h; b3 += ouu * h; b4 += ous * h; b5 += oss * h;
      used += 1;
    }
    points += used;
    // basis [1, u, s, u², us, s²]
    A[0] = m00; A[1] = m10; A[2] = m01; A[3] = m20; A[4] = m11; A[5] = m02;
    A[6] = m10; A[7] = m20; A[8] = m11; A[9] = m30; A[10] = m21; A[11] = m12;
    A[12] = m01; A[13] = m11; A[14] = m02; A[15] = m21; A[16] = m12; A[17] = m03;
    A[18] = m20; A[19] = m30; A[20] = m21; A[21] = m40; A[22] = m31; A[23] = m22;
    A[24] = m11; A[25] = m21; A[26] = m12; A[27] = m31; A[28] = m22; A[29] = m13;
    A[30] = m02; A[31] = m12; A[32] = m03; A[33] = m22; A[34] = m13; A[35] = m04;
    B[0] = b0; B[1] = b1; B[2] = b2; B[3] = b3; B[4] = b4; B[5] = b5;
    let h0 = solveFirstScratch(A, B, 6);
    if (h0 === null) {
      degraded += 1;
      h0 = solveFirstScratch(A, B, 3);
    }
    if (h0 === null) {
      skipped += 1;
      continue;
    }
    out[v * 3] = clampf(d[v * 3]! + h0 * Nx, lo[v * 3]!, hi[v * 3]!);
    out[v * 3 + 1] = clampf(d[v * 3 + 1]! + h0 * Ny, lo[v * 3 + 1]!, hi[v * 3 + 1]!);
    out[v * 3 + 2] = clampf(d[v * 3 + 2]! + h0 * Nz, lo[v * 3 + 2]!, hi[v * 3 + 2]!);
  }
  d.set(out);
  return { skipped, degraded, points, ringFits: 0 };
}

const SCR_M = new Float64Array(42);
/** solveAll for c[0] only, on a module scratch buffer (no allocation). */
function solveFirstScratch(A0: Float64Array, B0: Float64Array, n: number): number | null {
  const W = n + 1;
  const M = SCR_M;
  let scale = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i * W + j] = A0[i * 6 + j]!;
    M[i * W + n] = B0[i]!;
    const dg = A0[i * 6 + i]!;
    if (dg > scale) scale = dg;
  }
  if (scale <= 0) return null;
  const eps = scale * 1e-9;
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = M[col * W + col]! < 0 ? -M[col * W + col]! : M[col * W + col]!;
    for (let r = col + 1; r < n; r++) {
      const v = M[r * W + col]! < 0 ? -M[r * W + col]! : M[r * W + col]!;
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best < eps) return null;
    if (piv !== col) {
      for (let j = 0; j < W; j++) {
        const tmp = M[col * W + j]!;
        M[col * W + j] = M[piv * W + j]!;
        M[piv * W + j] = tmp;
      }
    }
    const pv = M[col * W + col]!;
    for (let r = col + 1; r < n; r++) {
      const f = M[r * W + col]! / pv;
      if (f === 0) continue;
      for (let j = col; j < W; j++) M[r * W + j] = M[r * W + j]! - f * M[col * W + j]!;
    }
  }
  // back substitution, keeping only what c[0] needs (all of it)
  let c0 = 0;
  const C = SCR_C;
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r * W + n]!;
    for (let j = r + 1; j < n; j++) s -= M[r * W + j]! * C[j]!;
    C[r] = s / M[r * W + r]!;
  }
  c0 = C[0]!;
  return c0;
}
const SCR_C = new Float64Array(6);

/** Solve the leading n×n block of the 6-wide system A c = B by Gaussian
 *  elimination with partial pivoting (fixed order) and return c, or null
 *  when a pivot falls below 1e-9 of the largest diagonal entry. */
function solveAll(A0: Float64Array, B0: Float64Array, n: number): Float64Array | null {
  const W = n + 1;
  const M = new Float64Array(n * W);
  let scale = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i * W + j] = A0[i * 6 + j]!;
    M[i * W + n] = B0[i]!;
    const dg = A0[i * 6 + i]!;
    if (dg > scale) scale = dg;
  }
  if (scale <= 0) return null;
  const eps = scale * 1e-9;
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = M[col * W + col]! < 0 ? -M[col * W + col]! : M[col * W + col]!;
    for (let r = col + 1; r < n; r++) {
      const v = M[r * W + col]! < 0 ? -M[r * W + col]! : M[r * W + col]!;
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best < eps) return null;
    if (piv !== col) {
      for (let j = 0; j < W; j++) {
        const tmp = M[col * W + j]!;
        M[col * W + j] = M[piv * W + j]!;
        M[piv * W + j] = tmp;
      }
    }
    const pv = M[col * W + col]!;
    for (let r = col + 1; r < n; r++) {
      const f = M[r * W + col]! / pv;
      if (f === 0) continue;
      for (let j = col; j < W; j++) M[r * W + j] = M[r * W + j]! - f * M[col * W + j]!;
    }
  }
  const c = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r * W + n]!;
    for (let j = r + 1; j < n; j++) s -= M[r * W + j]! * c[j]!;
    c[r] = s / M[r * W + r]!;
  }
  return c;
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
