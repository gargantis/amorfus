// §6.1: a block is a canonical u16, used everywhere — on the wire, on
// disk, in memory. Bits 0–7 material id (0 = air), bit 8 `sharp`,
// bits 9–15 reserved and must be 0. Air always has sharp = 0.

/** v1 material registry: append-only, fixed per protocolVersion (§6.1). */
export const MATERIALS = [
  'air',
  'grass',
  'dirt',
  'stone',
  'sand',
  'planks',
  'brick',
  'reserved7',
] as const;

export const MATERIAL_COUNT = MATERIALS.length;
export const AIR = 0;

const SHARP_BIT = 1 << 8;

export function makeBlock(material: number, sharp: boolean): number {
  if (!Number.isInteger(material) || material <= 0 || material >= MATERIAL_COUNT) {
    if (material === AIR && !sharp) return AIR;
    throw new RangeError(`invalid material ${material}${material === AIR ? ' (air cannot be sharp)' : ''}`);
  }
  return material | (sharp ? SHARP_BIT : 0);
}

export const materialOf = (value: number): number => value & 0xff;
export const isSharp = (value: number): boolean => (value & SHARP_BIT) !== 0;
export const isSolid = (value: number): boolean => (value & 0xff) !== AIR;

export function isCanonical(value: number): boolean {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) return false;
  if ((value & ~0x1ff) !== 0) return false; // reserved bits 9–15
  const material = value & 0xff;
  if (material >= MATERIAL_COUNT) return false;
  if (material === AIR && (value & SHARP_BIT) !== 0) return false; // sharp air
  return true;
}
