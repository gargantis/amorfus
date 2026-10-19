// Timing reference only: production 'hints' at apron 6 (44³), the region gm-hint is timed on.
export const name = 'gm-ref-hints6';
export const describe = 'Reference: production hints mesher at apron 6 (timing only).';
export const apron = 6;
export function mesh(region, scene, h) { return h.decodeMesh(h.meshRegion({ ...region, params: {} })); }
