// Baseline: Minecraft cubes (all offsets 0), flat shaded.
export const name = 'cubes';
export const describe = 'Raw blocks: every offset 0, every face flat-shaded.';
export const flatShading = true;
export function mesh(region, scene, h) {
  return h.decodeMesh(h.meshRegion({ ...region, params: { k: 0, forceZeroOffsets: true } }));
}
