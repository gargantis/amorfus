import { describe, it, expect } from 'vitest';
import { parseSeedText, formatSeed, randomSeed } from './seed';

// §12.4 world list: the seed a player types. Two u32 numbers stay numbers,
// one number fills the first slot, anything else is hashed and kept as text.

const U32 = 2 ** 32;

describe('world seed text', () => {
  it('reads a numeric pair, with surrounding spaces, as the seed itself', () => {
    expect(parseSeedText('12,34')).toEqual({ seed: [12, 34] });
    expect(parseSeedText(' 7 , 0 ')).toEqual({ seed: [7, 0] });
    expect(parseSeedText('4294967295,0')).toEqual({ seed: [4294967295, 0] });
  });

  it('reads a lone integer into the first slot', () => {
    expect(parseSeedText('42')).toEqual({ seed: [42, 0] });
  });

  it('hashes any other text to two u32 and keeps the text', () => {
    const a = parseSeedText('hello world');
    expect(a.seedText).toBe('hello world');
    expect(a.seed[0]).toBeGreaterThanOrEqual(0);
    expect(a.seed[0]).toBeLessThan(U32);
    expect(a.seed[1]).toBeGreaterThanOrEqual(0);
    expect(a.seed[1]).toBeLessThan(U32);
    expect(Number.isInteger(a.seed[0]) && Number.isInteger(a.seed[1])).toBe(true);
    expect(parseSeedText('hello world')).toEqual(a); // deterministic
    expect(parseSeedText('hello worle').seed).not.toEqual(a.seed);
    // out-of-range or negative numbers are text, not numbers
    expect(parseSeedText('4294967296,0').seedText).toBe('4294967296,0');
    expect(parseSeedText('-1').seedText).toBe('-1');
    expect(parseSeedText('1.5').seedText).toBe('1.5');
  });

  it('draws a random seed for empty text', () => {
    const a = parseSeedText('');
    const b = parseSeedText('   ');
    expect(a.seedText).toBeUndefined();
    expect(a.seed).not.toEqual(b.seed);
    for (const s of [a.seed, b.seed, randomSeed()]) {
      for (const v of s) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(U32);
      }
    }
  });

  it('formats back to what the player typed, or to the pair', () => {
    expect(formatSeed([12, 34])).toBe('12,34');
    expect(formatSeed([12, 34], 'hello')).toBe('hello');
    const p = parseSeedText('mountain lake');
    expect(formatSeed(p.seed, p.seedText)).toBe('mountain lake');
    expect(parseSeedText(formatSeed([5, 6]))).toEqual({ seed: [5, 6] });
  });
});
