// Baseline: the §7.9 bevel rule on branch bevel-smoothing-rule.
export const name = 'bevel';
export const describe = '§7.9 bevel rule: occupancy-table corner offsets (cap 0.25), seam shift 0.25, no hints, no relaxation, flat facets.';
export function mesh(region, scene, h) {
  return h.decodeMesh(h.meshRegion({ ...region, params: { rule: 'bevel' } }));
}
