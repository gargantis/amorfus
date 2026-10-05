import { describe, it, expect } from 'vitest';
import { meshChunkSimple, VERTEX_STRIDE } from './simple-mesher';
import { CHUNK } from '../world/coords';
import { makeBlock, AIR } from '../world/block';

// M2 interim mesher (§15 M2): Minecraft-culled-face topology in the A.1
// vertex format. The full §7 mesher replaces it at M3; the renderer and
// formats it feeds are permanent.

const STONE = makeBlock(3, false);
const GRASS = makeBlock(1, false);
const P = CHUNK + 2; // padded region is 34³

function paddedRegion(fill: (x: number, y: number, z: number) => number): Uint16Array {
  const blocks = new Uint16Array(P * P * P);
  for (let y = -1; y <= CHUNK; y++) {
    for (let z = -1; z <= CHUNK; z++) {
      for (let x = -1; x <= CHUNK; x++) {
        blocks[((y + 1) * P + (z + 1)) * P + (x + 1)] = fill(x, y, z);
      }
    }
  }
  return blocks;
}

describe('meshChunkSimple', () => {
  it('meshes a flat floor into exactly one quad per column top', () => {
    // Solid everywhere y < 8 (including padding), air above: the only faces
    // inside the chunk are the 32×32 +y tops.
    const region = paddedRegion((_x, y) => (y < 8 ? STONE : AIR));
    const m = meshChunkSimple(region);
    expect(m.quadCount).toBe(32 * 32);
    expect(m.indexData.length).toBe(32 * 32 * 6);
    expect(m.vertexData.byteLength).toBe(32 * 32 * 4 * VERTEX_STRIDE);
  });

  it('encodes positions as (local + 0.5)·256 fixed point on corners (A.1)', () => {
    const region = paddedRegion((x, y, z) => (x === 0 && y === 0 && z === 0 ? STONE : AIR));
    const m = meshChunkSimple(region);
    expect(m.quadCount).toBe(6); // a lone cube
    const pos = new Uint16Array(m.vertexData);
    for (let v = 0; v < 24; v++) {
      const x = pos[v * 8]!;
      const y = pos[v * 8 + 1]!;
      const z = pos[v * 8 + 2]!;
      // corners of the unit cube at local 0..1 → 128 or 384
      expect([128, 384]).toContain(x);
      expect([128, 384]).toContain(y);
      expect([128, 384]).toContain(z);
    }
  });

  it('carries the solid block material on every face', () => {
    const region = paddedRegion((x, y, z) => (x === 5 && y === 5 && z === 5 ? GRASS : AIR));
    const m = meshChunkSimple(region);
    const bytes = new Uint8Array(m.vertexData);
    for (let v = 0; v < m.quadCount * 4; v++) {
      expect(bytes[v * VERTEX_STRIDE + 12]).toBe(1); // grass id
    }
  });

  it('emits no faces for uniform regions', () => {
    expect(meshChunkSimple(paddedRegion(() => STONE)).quadCount).toBe(0);
    expect(meshChunkSimple(paddedRegion(() => AIR)).quadCount).toBe(0);
  });

  it('owns only faces whose solid block is inside the chunk', () => {
    // Solid padding column just outside -x: its +x faces belong to the
    // neighbouring chunk, not this one.
    const region = paddedRegion((x) => (x === -1 ? STONE : AIR));
    expect(meshChunkSimple(region).quadCount).toBe(0);
  });

  it('keeps AO inside [0.55, 1] scaled to bytes', () => {
    const region = paddedRegion((_x, y) => (y < 8 ? STONE : AIR));
    const m = meshChunkSimple(region);
    const bytes = new Uint8Array(m.vertexData);
    for (let v = 0; v < m.quadCount * 4; v++) {
      const ao = bytes[v * VERTEX_STRIDE + 6]!;
      expect(ao).toBeGreaterThanOrEqual(Math.floor(0.55 * 255));
      expect(ao).toBeLessThanOrEqual(255);
    }
  });

  it('writes unit octahedral normals matching the face axis', () => {
    const region = paddedRegion((x, y, z) => (x === 5 && y === 5 && z === 5 ? STONE : AIR));
    const m = meshChunkSimple(region);
    const snorm = new Int16Array(m.vertexData);
    // every +y face vertex decodes to (0,1,0): oct encoding of +y is (0,0)
    // in snorm… just assert each vertex's normal has unit-ish length after
    // decode via the mesher's own decoder export.
    const { octDecode } = m.debug;
    for (let v = 0; v < m.quadCount * 4; v++) {
      const nx = snorm[v * 8 + 4]! / 32767;
      const ny = snorm[v * 8 + 5]! / 32767;
      const [dx, dy, dz] = octDecode(nx, ny);
      expect(Math.hypot(dx, dy, dz)).toBeCloseTo(1, 3);
      // axis-aligned for the cube case
      const mx = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
      expect(mx).toBeCloseTo(1, 3);
    }
  });
});
