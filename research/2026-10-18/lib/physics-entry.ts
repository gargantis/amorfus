// Entry for the physics bundles the reviewers used (work/vgs/physics-real.mjs,
// work/vgh/physics-real-check.mjs): the repo's own §9.3 controller and
// collision, re-exported unchanged.
export { CHUNK, chunkOfCell, localIndex, packChunkKey } from '../../../src/core/world/coords';
export { trianglesInBox, trianglesOfLowerBlock } from '../../../src/core/physics/collision';
export { PLAYER, stepPlayer } from '../../../src/core/physics/controller';
export { AIR, makeBlock } from '../../../src/core/world/block';
