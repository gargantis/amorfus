// VGS: re-export the REPO's real controller + collision (read-only import by absolute path).
export { stepPlayer, PLAYER } from '../../../../../src/core/physics/controller';
export type { PlayerState, ControllerInput } from '../../../../../src/core/physics/controller';
export { trianglesInBox, trianglesOfLowerBlock } from '../../../../../src/core/physics/collision';
export { CHUNK, packChunkKey, chunkOfCell, localIndex } from '../../../../../src/core/world/coords';
export { makeBlock, AIR } from '../../../../../src/core/world/block';
