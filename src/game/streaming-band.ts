// The vertical chunk band the streaming world keeps loaded. It always
// covers the generator's terrain band and follows the camera beyond it,
// clamped to the world's chunk range (y ∈ [−256, 512) → cy ∈ [−8, 15]).
import { CHUNK } from '../core/world/coords';

const TERRAIN_CY_MIN = -2;
const TERRAIN_CY_MAX = 4;
const WORLD_CY_MIN = -8;
const WORLD_CY_MAX = 15;

export function chunkBandFor(cameraY: number): [number, number] {
  const camCy = Math.floor(cameraY / CHUNK);
  return [
    Math.max(WORLD_CY_MIN, Math.min(TERRAIN_CY_MIN, camCy - 1)),
    Math.min(WORLD_CY_MAX, Math.max(TERRAIN_CY_MAX, camCy + 1)),
  ];
}
