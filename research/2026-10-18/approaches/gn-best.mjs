// gn-best: production geometry (hints rule; positions, indices, materials
// byte-identical), new values in the existing AO and normal vertex fields.
//  AO — box kernel 4 blocks wide centred at the vertex's ACTUAL (quantised)
//       position, over a partial-volume field: clamp(½ + 4ρ, 0, 1) for
//       generated blocks (HINT_SCALE = 4, so 4ρ ≈ signed density in blocks),
//       occupancy for shape-edited blocks; quadratic onset
//       AO = clamp(1 − 4.8·max(0, F − ½)², 0.55, 1).
//  N  — production area-weighted normals, except near smooth edits (a
//       non-sharp shape-edited block within 2 blocks of the cell, and no
//       sharp block in the cell): mean of the unit area normals over the
//       3-ring of mesh edges, computed on the PRE-relaxation (guarded,
//       capped) positions. Surface-connected, so separate surfaces (a
//       ledge over ground, a ceiling over a floor) never mix.
// Reach: AO 3 blocks; ring 3 steps + d₀ (cell + guard + caps) = 7 blocks.
// GEN_MESH aprons stay 3 (no edits within reach) and 10 (edits).
import { meshRegion } from '../work/gn/mesher-gn.mjs';
export const name = 'gn-best';
export const describe = 'Hints geometry untouched; AO = 4-wide box at the actual vertex position over hint partial volume (occupancy where edited), quadratic onset; normals = area-weighted, but near smooth edits the 3-ring mean of pre-relaxation area normals.';
export const PARAMS = {
  aoRule: 'smooth', aoKernel: 'box', pvRule: 'rho', aoCurve: 'quad', aoGain: 4.8, aoBias: 0.5, aoMin: 0.55,
  normalRule: 'ring', normalRings: 3, normalFromD0: true, normalScope: 'edited', editReach: 2,
  fastShade: true, // production-shaped path; same bytes as the generic one (work/gn/fastsame.mjs)
};
export function mesh(region, scene, core) {
  return core.decodeMesh(meshRegion({ ...region, params: PARAMS }));
}
