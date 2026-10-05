// §6.4: stateless, exactly rounded randomness. Everything here is 32-bit
// integer arithmetic via Math.imul and shifts — allowlisted operations only.

/** One splitmix32 step; returns the next state. */
export function splitmix32(state: number): number {
  let z = (state + 0x9e3779b9) | 0;
  z ^= z >>> 16;
  z = Math.imul(z, 0x21f0aaad);
  z ^= z >>> 15;
  z = Math.imul(z, 0x735a2d97);
  z ^= z >>> 15;
  return z | 0;
}

/** Stateless cell hash: 32-bit, uniform-ish, for feature placement. */
export function hash32(seed: number, x: number, y: number, z: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ x, 0x85ebca6b);
  h = Math.imul(h ^ y, 0xc2b2ae35);
  h = Math.imul(h ^ z, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h | 0;
}

/** Derive a chain of independent 32-bit sub-seeds from the world seed pair. */
export function subSeeds(seed: readonly [number, number], count: number): number[] {
  let s = (seed[0] ^ Math.imul(seed[1] | 0, 0x9e3779b1)) | 0;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    s = splitmix32(s);
    out.push(s);
  }
  return out;
}
