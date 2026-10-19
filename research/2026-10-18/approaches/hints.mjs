// Baseline: the production default rule (guarded surface nets, hints,
// k = 6 relaxation of edited regions, smooth normals).
export const name = 'hints';
export const describe = "Production default: guarded surface nets from generator hints; edited regions relax (k = 6) inside the guard and D-3 caps; smooth normals; a quad shows its block's material.";
export function mesh(region, scene, h) {
  return h.decodeMesh(h.meshRegion({ ...region, params: {} }));
}
