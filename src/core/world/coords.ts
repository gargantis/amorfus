// §6.2: 32³ cubic chunks; world bounds are protocol constants of
// generator v1. The chunk key packs (cx, cy, cz) into one safe-integer
// Number: cx, cz ∈ [−2¹⁸, 2¹⁸), cy ∈ [−8, 16), so the packed value stays
// below 2⁴⁴ ≪ 2⁵³.

export const CHUNK = 32;

export const WORLD_X_MIN = -(2 ** 23);
export const WORLD_X_MAX = 2 ** 23;
export const WORLD_Y_MIN = -256;
export const WORLD_Y_MAX = 512;

const CX_MIN = WORLD_X_MIN / CHUNK; // -2^18
const CX_SPAN = (WORLD_X_MAX - WORLD_X_MIN) / CHUNK; // 2^19
const CY_MIN = WORLD_Y_MIN / CHUNK; // -8
const CY_SPAN = (WORLD_Y_MAX - WORLD_Y_MIN) / CHUNK; // 24

export function inWorldBounds(x: number, y: number, z: number): boolean {
  return (
    x >= WORLD_X_MIN && x < WORLD_X_MAX &&
    z >= WORLD_X_MIN && z < WORLD_X_MAX &&
    y >= WORLD_Y_MIN && y < WORLD_Y_MAX
  );
}

export function chunkOfCell(x: number, y: number, z: number): { cx: number; cy: number; cz: number } {
  return { cx: Math.floor(x / CHUNK), cy: Math.floor(y / CHUNK), cz: Math.floor(z / CHUNK) };
}

/** A.2: index = (y·32 + z)·32 + x over chunk-local coordinates. */
export function localIndex(x: number, y: number, z: number): number {
  return (y * CHUNK + z) * CHUNK + x;
}

export function cellOfIndex(index: number): { x: number; y: number; z: number } {
  const x = index % CHUNK;
  const z = Math.floor(index / CHUNK) % CHUNK;
  const y = Math.floor(index / (CHUNK * CHUNK));
  return { x, y, z };
}

export function packChunkKey(cx: number, cy: number, cz: number): number {
  if (cx < CX_MIN || cx >= CX_MIN + CX_SPAN || cz < CX_MIN || cz >= CX_MIN + CX_SPAN ||
      cy < CY_MIN || cy >= CY_MIN + CY_SPAN) {
    throw new RangeError(`chunk out of world bounds: ${cx},${cy},${cz}`);
  }
  return ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
}

export function unpackChunkKey(key: number): { cx: number; cy: number; cz: number } {
  const cy = (key % CY_SPAN) + CY_MIN;
  const rest = Math.floor(key / CY_SPAN);
  const cz = (rest % CX_SPAN) + CX_MIN;
  const cx = Math.floor(rest / CX_SPAN) + CX_MIN;
  return { cx, cy, cz };
}
