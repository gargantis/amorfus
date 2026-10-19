// Timing reference only: production 'hints' at the unedited GEN_MESH apron (3, a 38³ region).
export const name = 'gm-ref-hints3';
export const describe = 'Reference: production hints mesher at apron 3 (timing only).';
export const apron = 3;
export function mesh(region, scene, h) { return h.decodeMesh(h.meshRegion({ ...region, params: {} })); }
