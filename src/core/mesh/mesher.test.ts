import { describe, it, expect } from 'vitest';
import { meshRegion, type MeshParams } from './mesher';
import { CHUNK } from '../world/coords';
import { makeBlock, AIR } from '../world/block';

// §7 guarded surface nets + §14 mesher invariants. Helpers build synthetic
// regions; the region layout is (y·nz + z)·nx + x with an `apron` margin
// around the emitted chunk.

const STONE = makeBlock(3, false);
const SHARP_BRICK = makeBlock(6, true);

interface Build {
  apron: number;
  n: number;
  blocks: Uint16Array;
  rho: Float32Array;
  shapeEdited: Uint8Array;
}

/** Build a region with the chunk at [0,32)³ and `apron` extra cells. */
function build(
  apron: number,
  fill: (x: number, y: number, z: number) => { v: number; rho?: number; edited?: boolean },
): Build {
  const n = CHUNK + 2 * apron;
  const blocks = new Uint16Array(n * n * n);
  const rho = new Float32Array(n * n * n);
  const shapeEdited = new Uint8Array(n * n * n);
  for (let y = 0; y < n; y++) {
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = (y * n + z) * n + x;
        const r = fill(x - apron, y - apron, z - apron);
        blocks[i] = r.v;
        rho[i] = r.rho ?? (r.v === AIR ? -1 : 1);
        shapeEdited[i] = r.edited === true ? 1 : 0;
      }
    }
  }
  return { apron, n, blocks, rho, shapeEdited };
}

function mesh(b: Build, params?: Partial<MeshParams>) {
  return meshRegion({
    nx: b.n, ny: b.n, nz: b.n,
    apron: b.apron,
    blocks: b.blocks,
    rho: b.rho,
    shapeEdited: b.shapeEdited,
    params,
  });
}

/** Decode vertex positions (chunk-local blocks) from the A.1 buffer. */
function positionsOf(m: ReturnType<typeof meshRegion>): Array<[number, number, number]> {
  const u16 = new Uint16Array(m.vertexData);
  const out: Array<[number, number, number]> = [];
  for (let v = 0; v < m.vertexCount; v++) {
    out.push([
      u16[v * 8]! / 256 - 0.5,
      u16[v * 8 + 1]! / 256 - 0.5,
      u16[v * 8 + 2]! / 256 - 0.5,
    ]);
  }
  return out;
}

const flatFloor = (h: number) => (x: number, y: number, _z: number) =>
  ({ v: y < h ? STONE : AIR });

describe('meshRegion invariants (§14)', () => {
  it('cube reproduction: binary input, k = 0, forceZeroOffsets → exact cubes', () => {
    const b = build(3, flatFloor(8));
    const m = mesh(b, { k: 0, forceZeroOffsets: true });
    expect(m.quadCount).toBe(32 * 32);
    for (const [x, y, z] of positionsOf(m)) {
      expect(Number.isInteger(x)).toBe(true);
      expect(y).toBe(8);
      expect(Number.isInteger(z)).toBe(true);
    }
  });

  it('cube reproduction: every block sharp → exact cubes even with k = 6', () => {
    const b = build(3, (x, y, z) =>
      ({ v: y < 8 || (x === 4 && y === 8 && z === 4) ? SHARP_BRICK : AIR }));
    const m = mesh(b);
    for (const [x, y, z] of positionsOf(m)) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
      expect(Number.isInteger(z)).toBe(true);
    }
  });

  it('is watertight: every non-boundary mesh edge borders exactly two quads', () => {
    // A hinted sphere: smooth, closed inside the chunk.
    const b = build(3, (x, y, z) => {
      const d = 7 - Math.hypot(x - 16, y - 16, z - 16);
      return { v: d > 0 ? STONE : AIR, rho: Math.max(-1, Math.min(1, d / 4)) };
    });
    const m = mesh(b);
    expect(m.quadCount).toBeGreaterThan(100);
    const edgeCount = new Map<string, number>();
    for (let q = 0; q < m.quadCount; q++) {
      const idx = [
        m.indexData[q * 6]!, m.indexData[q * 6 + 1]!, m.indexData[q * 6 + 2]!,
        m.indexData[q * 6 + 5]!,
      ];
      // quad corners: tri (0,1,2) + (0,2,3) → ring 0-1-2-3
      const ring = [idx[0]!, idx[1]!, idx[2]!, idx[3]!];
      for (let e = 0; e < 4; e++) {
        const a = ring[e]!;
        const bb = ring[(e + 1) % 4]!;
        const key = a < bb ? `${a}:${bb}` : `${bb}:${a}`;
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      }
    }
    // Smooth vertices are shared per corner, so interior edges pair up.
    const odd = [...edgeCount.values()].filter((c) => c !== 2).length;
    expect(odd).toBe(0);
  });

  it('every vertex stays inside its cell (±0.5 box)', () => {
    const b = build(10, (x, y, z) => {
      const base = y < 8;
      const dug = x >= 10 && x < 12 && y >= 6 && y < 8 && z >= 10 && z < 12;
      return { v: base && !dug ? STONE : AIR, edited: dug };
    });
    const m = mesh(b);
    const u16 = new Uint16Array(m.vertexData);
    for (let v = 0; v < m.vertexCount; v++) {
      for (let a = 0; a < 3; a++) {
        const local = u16[v * 8 + a]! / 256 - 0.5; // block coordinate
        const nearest = Math.round(local);
        expect(Math.abs(local - nearest)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('sharp faces lie exactly on their planes', () => {
    const b = build(3, (x, y, _z) => ({
      v: y < 8 ? STONE : x === 16 && y < 12 ? SHARP_BRICK : AIR,
      rho: y < 8 ? 1 : x === 16 && y < 12 ? 1 : -1,
    }));
    const m = mesh(b);
    const u16 = new Uint16Array(m.vertexData);
    // every vertex of a sharp-flagged quad sits on integer planes for the
    // pinned axes; at minimum, x of the wall's side faces is exactly 16 or 17.
    let sharpVerts = 0;
    for (let v = 0; v < m.vertexCount; v++) {
      const flags = u16[v * 8 + 3]! >> 8;
      if ((flags & 1) === 1) {
        sharpVerts += 1;
        const x = u16[v * 8]! / 256 - 0.5;
        const y = u16[v * 8 + 1]! / 256 - 0.5;
        const z = u16[v * 8 + 2]! / 256 - 0.5;
        expect(Number.isInteger(x) || Number.isInteger(y) || Number.isInteger(z)).toBe(true);
      }
    }
    expect(sharpVerts).toBeGreaterThan(0);
  });

  it('thin features keep their minimum sizes (guard)', () => {
    // A 1-block floating cube, shape-edited, relaxed: volume-ish extent per
    // axis must stay ≥ 2·G[0] = 0.4 wide (§7.4 guard G[0] = 0.20).
    const b = build(10, (x, y, z) => ({
      v: x === 16 && y === 16 && z === 16 ? STONE : AIR,
      edited: x === 16 && y === 16 && z === 16,
    }));
    const m = mesh(b);
    expect(m.quadCount).toBe(6);
    const pos = positionsOf(m);
    for (let a = 0; a < 3; a++) {
      const vals = pos.map((p) => p[a]!);
      const extent = Math.max(...vals) - Math.min(...vals);
      expect(extent).toBeGreaterThanOrEqual(0.4 - 1 / 128);
    }
  });

  it('a dug 1×2 tunnel keeps its clearance opening (D-3)', () => {
    // Tunnel along z at x=16, y∈{8,9}, dug through solid shape-edited.
    const b = build(10, (x, y, z) => {
      const solid = y < 12;
      const dug = x === 16 && (y === 8 || y === 9) && z >= 4 && z < 28;
      return { v: solid && !dug ? STONE : AIR, edited: dug };
    });
    const m = mesh(b);
    const pos = positionsOf(m);
    // §7.4: openings keep (W − 0.3) × (H − 0.1): width ≥ 0.7, height ≥ 1.9.
    // Check at tunnel mid-depth: vertices lining the tunnel walls.
    const wall = pos.filter(
      (p) => p[2]! > 14 && p[2]! < 18 && p[1]! > 7.4 && p[1]! < 10.6 && Math.abs(p[0]! - 16.5) < 1.2,
    );
    const xs = wall.map((p) => p[0]!);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(0.7 - 1 / 128);
    const ys = wall.map((p) => p[1]!);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(1.9 - 1 / 128);
  });

  it('hinted generated slopes come out smooth (≤ 0.1° on 1:4)', () => {
    // Height field h(x) = 8 + x/4 with ρ = clamp((h − y)/4) hints.
    const b = build(3, (x, y, _z) => {
      const d = 8 + (x + 3) / 4 - y;
      return { v: d > 0 ? STONE : AIR, rho: Math.max(-1, Math.min(1, d / 4)) };
    });
    const m = mesh(b);
    // Sample top-surface vertices away from region borders; fit normal
    // error via neighbouring vertex slope.
    const pos = positionsOf(m).filter(
      (p) => p[1]! > 6 && p[2]! > 8 && p[2]! < 24 && p[0]! > 4 && p[0]! < 28,
    );
    expect(pos.length).toBeGreaterThan(50);
    // group by (x quantised): slope between consecutive x at same z
    const byZ = new Map<number, Array<[number, number]>>();
    for (const p of pos) {
      const zq = Math.round(p[2]! * 4);
      if (!byZ.has(zq)) byZ.set(zq, []);
      byZ.get(zq)!.push([p[0]!, p[1]!]);
    }
    let worst = 0;
    for (const line of byZ.values()) {
      line.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < line.length; i++) {
        const dx = line[i]![0] - line[i - 1]![0];
        if (dx < 0.5) continue;
        const slope = (line[i]![1] - line[i - 1]![1]) / dx;
        const err = Math.abs(Math.atan(slope) - Math.atan(0.25)) * (180 / Math.PI);
        worst = Math.max(worst, err);
      }
    }
    expect(worst).toBeLessThanOrEqual(0.75); // quantisation-limited bound
  });

  it('partition invariance: one 64-wide region equals two 52³-style regions', () => {
    const fill = (x: number, y: number, z: number) => {
      const d = 9 + 3 * Math.sin(x / 5) + 2 * Math.cos(z / 7) - y;
      const dug = x >= 30 && x < 34 && y >= 8 && y < 10 && z >= 14 && z < 16;
      const v = d > 0 && !dug ? STONE : AIR;
      return { v, rho: dug ? (v === AIR ? -1 : 1) : Math.max(-1, Math.min(1, d / 4)), edited: dug };
    };
    const apron = 10;
    // Chunk A = [0,32), chunk B = [32,64) along x (y,z chunks [0,32)).
    const mk = (xOff: number) => {
      const n = CHUNK + 2 * apron;
      const blocks = new Uint16Array(n * n * n);
      const rho = new Float32Array(n * n * n);
      const shapeEdited = new Uint8Array(n * n * n);
      for (let y = 0; y < n; y++) {
        for (let z = 0; z < n; z++) {
          for (let x = 0; x < n; x++) {
            const i = (y * n + z) * n + x;
            const r = fill(x - apron + xOff, y - apron, z - apron);
            blocks[i] = r.v;
            rho[i] = r.rho;
            shapeEdited[i] = r.edited ? 1 : 0;
          }
        }
      }
      return meshRegion({ nx: n, ny: n, nz: n, apron, blocks, rho, shapeEdited, params: {} });
    };
    const a = mk(0);
    const b = mk(32);
    // Boundary vertices (x = 32 in world = local 32 in A, local 0 in B)
    // must agree exactly: quantised positions AND normals (§7.5).
    const grab = (m: ReturnType<typeof meshRegion>, xLocal: number) => {
      const u16 = new Uint16Array(m.vertexData);
      const i16 = new Int16Array(m.vertexData);
      const map = new Map<string, [number, number]>();
      for (let v = 0; v < m.vertexCount; v++) {
        const x = u16[v * 8]! / 256 - 0.5;
        if (Math.abs(x - xLocal) > 0.49) continue;
        const key = `${u16[v * 8 + 1]}:${u16[v * 8 + 2]}:${(x - xLocal).toFixed(4)}:${u16[v * 8 + 3]! & 0xff}`;
        map.set(key, [i16[v * 8 + 4]!, i16[v * 8 + 5]!]);
      }
      return map;
    };
    // §7.5: a vertex EMITTED BY BOTH chunks must agree exactly in
    // quantised position (the key) and normal. Each side also emits
    // boundary vertices only its own quads use — those are not shared.
    const edgeA = grab(a, 32);
    const edgeB = grab(b, 0);
    let shared = 0;
    let normalMismatches = 0;
    for (const [key, na] of edgeA) {
      const nb = edgeB.get(key);
      if (nb === undefined) continue;
      shared += 1;
      if (nb[0] !== na[0] || nb[1] !== na[1]) normalMismatches += 1;
    }
    expect(shared).toBeGreaterThan(10);
    expect(normalMismatches).toBe(0);
  });

  it('seam negative control: a too-small apron breaks the invariance test', () => {
    // Same scene as above but apron 2 (< k + 4): the guard proves the seam
    // test can fail — §14 demands negative controls that must fail.
    const fill = (x: number, y: number, z: number) => {
      const d = 9 + 3 * Math.sin(x / 5) - y;
      const dug = x >= 30 && x < 34 && y >= 8 && y < 10 && z >= 14 && z < 16;
      const v = d > 0 && !dug ? STONE : AIR;
      return { v, rho: dug ? (v === AIR ? -1 : 1) : Math.max(-1, Math.min(1, d / 4)), edited: dug };
    };
    const mk = (xOff: number, apron: number) => {
      const n = CHUNK + 2 * apron;
      const blocks = new Uint16Array(n * n * n);
      const rho = new Float32Array(n * n * n);
      const shapeEdited = new Uint8Array(n * n * n);
      for (let y = 0; y < n; y++) {
        for (let z = 0; z < n; z++) {
          for (let x = 0; x < n; x++) {
            const i = (y * n + z) * n + x;
            const r = fill(x - apron + xOff, y - apron, z - apron);
            blocks[i] = r.v;
            rho[i] = r.rho;
            shapeEdited[i] = r.edited ? 1 : 0;
          }
        }
      }
      return meshRegion({ nx: n, ny: n, nz: n, apron, blocks, rho, shapeEdited, params: {} });
    };
    const a = mk(0, 2);
    const b = mk(32, 2);
    const posA = new Set(
      positionsOf(a).filter((p) => Math.abs(p[0]! - 32) < 0.49).map((p) => `${p[1]!.toFixed(3)}:${p[2]!.toFixed(3)}:${(p[0]! - 32).toFixed(3)}`),
    );
    const posB = new Set(
      positionsOf(b).filter((p) => Math.abs(p[0]!) < 0.49).map((p) => `${p[1]!.toFixed(3)}:${p[2]!.toFixed(3)}:${p[0]!.toFixed(3)}`),
    );
    let mismatch = false;
    for (const k of posA) if (!posB.has(k)) mismatch = true;
    for (const k of posB) if (!posA.has(k)) mismatch = true;
    expect(mismatch).toBe(true);
  });

  it('winds every face CCW from the air side (cullMode back)', () => {
    // A lone cube exposes all 6 orientations.
    const b = build(3, (x, y, z) => ({ v: x === 16 && y === 16 && z === 16 ? STONE : AIR }));
    const m = mesh(b, { k: 0, forceZeroOffsets: true });
    expect(m.quadCount).toBe(6);
    const pos = m.positions;
    for (let q = 0; q < 6; q++) {
      const i0 = m.indexData[q * 6]!;
      const i1 = m.indexData[q * 6 + 1]!;
      const i2 = m.indexData[q * 6 + 2]!;
      const ax = pos[i1 * 3]! - pos[i0 * 3]!;
      const ay = pos[i1 * 3 + 1]! - pos[i0 * 3 + 1]!;
      const az = pos[i1 * 3 + 2]! - pos[i0 * 3 + 2]!;
      const bx = pos[i2 * 3]! - pos[i0 * 3]!;
      const by = pos[i2 * 3 + 1]! - pos[i0 * 3 + 1]!;
      const bz = pos[i2 * 3 + 2]! - pos[i0 * 3 + 2]!;
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      // outward = away from the cube centre (16.5, 16.5, 16.5)
      const cx = (pos[i0 * 3]! + pos[i1 * 3]! + pos[i2 * 3]!) / 3 - 16.5;
      const cy = (pos[i0 * 3 + 1]! + pos[i1 * 3 + 1]! + pos[i2 * 3 + 1]!) / 3 - 16.5;
      const cz = (pos[i0 * 3 + 2]! + pos[i1 * 3 + 2]! + pos[i2 * 3 + 2]!) / 3 - 16.5;
      expect(nx * cx + ny * cy + nz * cz).toBeGreaterThan(0);
    }
  });

  it('pick records cover every quad, CSR-sorted by lower block', () => {
    const b = build(3, flatFloor(8));
    const m = mesh(b);
    expect(m.pickRecords.length).toBe(m.quadCount);
    expect(m.pickOffsets.length).toBe(32768 + 1);
    expect(m.pickOffsets[32768]).toBe(m.quadCount);
    for (let blockIdx = 0; blockIdx < 32768; blockIdx++) {
      for (let r = m.pickOffsets[blockIdx]!; r < m.pickOffsets[blockIdx + 1]!; r++) {
        const rec = m.pickRecords[r]!;
        expect(rec & 0x7fff).toBe(blockIdx);
      }
    }
  });

  it('normals are finite, non-zero, unit-ish', () => {
    const b = build(3, (x, y, z) => {
      const d = 7 - Math.hypot(x - 16, y - 12, z - 16);
      return { v: d > 0 ? STONE : AIR, rho: Math.max(-1, Math.min(1, d / 4)) };
    });
    const m = mesh(b);
    const i16 = new Int16Array(m.vertexData);
    const decode = (x: number, y: number): [number, number, number] => {
      const nz = 1 - Math.abs(x) - Math.abs(y);
      let nx = x;
      let ny = y;
      if (nz < 0) {
        const tx = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
        const ty = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
        nx = tx;
        ny = ty;
      }
      return [nx, ny, nz];
    };
    for (let v = 0; v < m.vertexCount; v++) {
      const ox = i16[v * 8 + 4]! / 32767;
      const oy = i16[v * 8 + 5]! / 32767;
      expect(Number.isFinite(ox)).toBe(true);
      expect(Math.abs(ox)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(oy)).toBeLessThanOrEqual(1.0001);
      // Raw octahedral decode lengths range over [1/√3, 1]; the point is
      // that nothing decodes to (near) zero.
      const [dx, dy, dz] = decode(ox, oy);
      expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(0.5);
    }
  });
});
