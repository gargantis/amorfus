// §12.4 world list: the seed a player types for a new world. A pair of
// u32 numbers is the seed itself and a lone integer fills the first slot;
// any other text is hashed (FNV-1a, two variants) and kept as `seedText`
// so the list can show it. Empty text draws a random seed.

const U32_MAX = 0xffffffff;
const PAIR = /^\s*(\d{1,10})\s*(?:,\s*(\d{1,10})\s*)?$/;

export interface ParsedSeed {
  seed: [number, number];
  seedText?: string;
}

function fnv1a(text: string, basis: number): number {
  let h = basis >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function randomSeed(): [number, number] {
  const u = new Uint32Array(2);
  crypto.getRandomValues(u);
  return [u[0]!, u[1]!];
}

export function parseSeedText(text: string): ParsedSeed {
  if (text.trim() === '') return { seed: randomSeed() };
  const m = PAIR.exec(text);
  if (m !== null) {
    const a = Number(m[1]);
    const b = m[2] === undefined ? 0 : Number(m[2]);
    if (a <= U32_MAX && b <= U32_MAX) return { seed: [a, b] };
  }
  return { seed: [fnv1a(text, 2166136261), fnv1a(text, 0x9747b28c)], seedText: text };
}

export function formatSeed(seed: readonly [number, number], seedText?: string): string {
  return seedText ?? `${seed[0]},${seed[1]}`;
}
