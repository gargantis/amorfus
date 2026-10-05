import { describe, it, expect } from 'vitest';
import {
  AIR,
  MATERIALS,
  MATERIAL_COUNT,
  makeBlock,
  materialOf,
  isSharp,
  isSolid,
  isCanonical,
} from './block';

// §6.1: a block is a canonical u16 — bits 0–7 material (0 = air), bit 8
// sharp, bits 9–15 reserved zero. Air always has sharp = 0. Non-canonical
// values are invalid everywhere.
describe('block value codec', () => {
  it('registers the v1 materials in order', () => {
    expect(MATERIALS.slice(0, 7)).toEqual(['air', 'grass', 'dirt', 'stone', 'sand', 'planks', 'brick']);
    expect(MATERIAL_COUNT).toBe(8); // six named + one reserved + air
    expect(AIR).toBe(0);
  });

  it('packs and unpacks material and sharp', () => {
    const v = makeBlock(3, true);
    expect(materialOf(v)).toBe(3);
    expect(isSharp(v)).toBe(true);
    expect(isSolid(v)).toBe(true);
    const w = makeBlock(5, false);
    expect(materialOf(w)).toBe(5);
    expect(isSharp(w)).toBe(false);
  });

  it('air is never solid and never sharp', () => {
    expect(isSolid(AIR)).toBe(false);
    expect(() => makeBlock(0, true)).toThrow();
  });

  it('accepts exactly the canonical values', () => {
    expect(isCanonical(0)).toBe(true);
    expect(isCanonical(makeBlock(6, true))).toBe(true);
    expect(isCanonical(1 << 8)).toBe(false); // sharp air
    expect(isCanonical(1 << 9)).toBe(false); // reserved bit set
    expect(isCanonical(0xffff)).toBe(false);
    expect(isCanonical(MATERIAL_COUNT)).toBe(false); // material beyond registry
    expect(isCanonical(-1)).toBe(false);
    expect(isCanonical(1.5)).toBe(false);
  });

  it('every canonical value round-trips', () => {
    for (let m = 1; m < MATERIAL_COUNT; m++) {
      for (const sharp of [false, true]) {
        const v = makeBlock(m, sharp);
        expect(isCanonical(v)).toBe(true);
        expect(materialOf(v)).toBe(m);
        expect(isSharp(v)).toBe(sharp);
      }
    }
  });
});
