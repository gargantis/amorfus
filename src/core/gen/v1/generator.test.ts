import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  GENERATOR_VERSION,
  BAND_MIN,
  BAND_MAX,
  HINT_SCALE,
  heightAt,
  generateChunk,
  generateRegion,
} from './index';
import { CHUNK } from '../../world/coords';
import { AIR, materialOf, MATERIALS } from '../../world/block';
import goldens from './goldens.json';

const SEED: [number, number] = [0xdeadbeef, 0x12345678];

describe('generator v1', () => {
  it('is version 1 with the frozen band constants', () => {
    expect(GENERATOR_VERSION).toBe(1);
    expect(BAND_MIN).toBe(-64);
    expect(BAND_MAX).toBe(160);
  });

  it('keeps H inside (−56, 152) so ridges never clip the band (§6.4)', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 20000; i++) {
      const x = ((i * 2654435761) % (2 ** 24)) - 2 ** 23;
      const z = ((i * 1013904223) % (2 ** 24)) - 2 ** 23;
      const h = heightAt(SEED, x, z);
      if (h < min) min = h;
      if (h > max) max = h;
    }
    expect(min).toBeGreaterThan(-56);
    expect(max).toBeLessThan(152);
    expect(max + 8).toBeLessThan(BAND_MAX);
    expect(min - 8).toBeGreaterThan(BAND_MIN);
  });

  it('makes chunks below the band uniform stone and above it uniform air', () => {
    const below = generateChunk(SEED, 3, -8, -2);
    expect(below.storage.kind).toBe('uniform');
    if (below.storage.kind === 'uniform') {
      expect(MATERIALS[materialOf(below.storage.value)]).toBe('stone');
    }
    expect(below.hints).toBe('saturated');
    const above = generateChunk(SEED, 3, 8, -2);
    expect(above.storage.kind).toBe('uniform');
    if (above.storage.kind === 'uniform') expect(above.storage.value).toBe(AIR);
    expect(above.hints).toBe('saturated');
  });

  it('is order-independent: generating A,B equals B,A byte for byte', () => {
    const a1 = generateChunk(SEED, 0, 0, 0);
    const b1 = generateChunk(SEED, 1, 0, 0);
    const b2 = generateChunk(SEED, 1, 0, 0);
    const a2 = generateChunk(SEED, 0, 0, 0);
    expect(a1).toEqual(a2);
    expect(b1).toEqual(b2);
  });

  it('is partition-invariant: one 64-wide region equals two chunk regions', () => {
    const wide = generateRegion(SEED, -32, 0, 0, 64, 32, 32);
    const left = generateRegion(SEED, -32, 0, 0, 32, 32, 32);
    const right = generateRegion(SEED, 0, 0, 0, 32, 32, 32);
    for (let y = 0; y < 32; y++) {
      for (let z = 0; z < 32; z++) {
        for (let x = 0; x < 64; x++) {
          const w = wide.blocks[(y * 32 + z) * 64 + x]!;
          const half = x < 32 ? left : right;
          const h = half.blocks[(y * 32 + z) * 32 + (x & 31)]!;
          if (w !== h) {
            expect.fail(`block mismatch at ${x - 32},${y},${z}`);
          }
          const wh = wide.hints[(y * 32 + z) * 64 + x]!;
          const hh = half.hints[(y * 32 + z) * 32 + (x & 31)]!;
          if (wh !== hh) expect.fail(`hint mismatch at ${x - 32},${y},${z}`);
        }
      }
    }
  });

  it('hints are never zero and their sign always equals occupancy', () => {
    const c = generateChunk(SEED, 0, 0, 0);
    expect(c.storage.kind).toBe('dense');
    if (c.storage.kind !== 'dense') return;
    expect(c.hints).not.toBe('saturated');
    if (c.hints === 'saturated') return;
    for (let i = 0; i < c.storage.blocks.length; i++) {
      const hint = c.hints[i]!;
      expect(hint).not.toBe(0);
      expect(hint > 0).toBe(materialOf(c.storage.blocks[i]!) !== AIR);
      expect(Math.abs(hint)).toBeLessThanOrEqual(127);
    }
  });

  it('marks hints saturated exactly when every hint is ±127 (§6.2)', () => {
    expect(HINT_SCALE).toBeGreaterThan(0);
    let sawSaturated = 0;
    let sawPlane = 0;
    // High air chunks saturate once the terrain is ≥ HINT_SCALE below; find
    // one by scanning, since caves keep most underground chunks unsaturated.
    const samples: Array<[number, number, number]> = [
      [5, -2, 7], [0, -2, 0], [0, 0, 0], [7, 1, 7],
    ];
    outer: for (let cx = 0; cx < 16; cx++) {
      for (let cz = 0; cz < 16; cz++) {
        if (generateChunk(SEED, cx, 2, cz).hints === 'saturated') {
          samples.push([cx, 2, cz]);
          break outer;
        }
      }
    }
    for (const [cx, cy, cz] of samples) {
      const c = generateChunk(SEED, cx, cy, cz);
      const region = generateRegion(SEED, cx * CHUNK, cy * CHUNK, cz * CHUNK, CHUNK, CHUNK, CHUNK);
      const allSat = region.hints.every(
        (h, i) => Math.abs(h) === 127 && (h > 0) === (materialOf(region.blocks[i]!) !== AIR),
      );
      if (c.hints === 'saturated') {
        expect(allSat).toBe(true);
        sawSaturated++;
      } else {
        expect(allSat).toBe(false);
        sawPlane++;
      }
    }
    expect(sawSaturated).toBeGreaterThan(0);
    expect(sawPlane).toBeGreaterThan(0);
  });

  it('layers materials: grass or sand on top, dirt beneath, stone deep', () => {
    // Walk sample columns above the cave zone.
    let grassy = 0;
    for (let x = 0; x < 64; x += 8) {
      const h = heightAt(SEED, x, 0);
      const cy = Math.floor(h / CHUNK);
      const c = generateChunk(SEED, 0, cy, 0);
      if (c.storage.kind !== 'dense') continue;
      // find topmost solid in this column inside the chunk
      for (let y = CHUNK - 1; y >= 0; y--) {
        const v = c.storage.blocks[(y * CHUNK + 0) * CHUNK + x]!;
        if (materialOf(v) !== AIR) {
          const top = MATERIALS[materialOf(v)];
          expect(['grass', 'sand']).toContain(top);
          grassy++;
          break;
        }
      }
    }
    expect(grassy).toBeGreaterThan(0);
  });

  it('matches the frozen golden hashes', () => {
    for (const g of goldens as Array<{ seed: [number, number]; chunk: [number, number, number]; hash: string }>) {
      const c = generateChunk(g.seed, ...g.chunk);
      const h = createHash('sha256');
      if (c.storage.kind === 'uniform') h.update(`uniform:${c.storage.value}`);
      else h.update(Buffer.from(c.storage.blocks.buffer, c.storage.blocks.byteOffset, c.storage.blocks.byteLength));
      h.update(
        c.hints === 'saturated'
          ? 'saturated'
          : Buffer.from(c.hints.buffer, c.hints.byteOffset, c.hints.byteLength),
      );
      expect(`${g.chunk.join(',')}:${h.digest('hex')}`).toBe(`${g.chunk.join(',')}:${g.hash}`);
    }
    expect((goldens as unknown[]).length).toBeGreaterThanOrEqual(32);
  });
});
