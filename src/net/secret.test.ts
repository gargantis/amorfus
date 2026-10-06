import { describe, it, expect } from 'vitest';
import { generateSecret, formatSecret, normalizeSecret } from './secret';

// D-8/§10.2: one ≥100-bit secret — 20 Crockford base32 characters plus a
// mod-32 check character, shown in groups as K7QM-2XDP-4TR8-WHZN-3VBC-7.
describe('join secret', () => {
  it('generates 21 Crockford characters with a valid check', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[0-9A-HJKMNP-TV-Z]{21}$/);
    expect(normalizeSecret(s)).toBe(s);
  });

  it('formats as 4-character groups', () => {
    const s = 'K7QM2XDP4TR8WHZN3VBC7';
    expect(formatSecret(s)).toBe('K7QM-2XDP-4TR8-WHZN-3VBC-7');
  });

  it('normalizes dashes, spaces, case and the Crockford aliases', () => {
    const s = generateSecret();
    expect(normalizeSecret(formatSecret(s).toLowerCase())).toBe(s);
    const aliased = s.replace(/0/g, 'O').replace(/1/g, 'I');
    expect(normalizeSecret(aliased)).toBe(s);
  });

  it('rejects a corrupted check character and wrong lengths', () => {
    const s = generateSecret();
    const bad = s.slice(0, 20) + (s[20] === '0' ? '1' : '0');
    expect(normalizeSecret(bad)).toBeNull();
    expect(normalizeSecret(s.slice(0, 20))).toBeNull();
    expect(normalizeSecret('')).toBeNull();
    expect(normalizeSecret('UUUU-UUUU-UUUU-UUUU-UUUU-U')).toBeNull(); // U not in alphabet
  });

  it('two secrets never collide in practice', () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});
