// gm: generator MATERIAL HINTS (the literal v1 material rule on the
// continuous surface). The generator already computes the two fields its
// material rule thresholds — S = SEA+2 − H per column (sand ⇔ S ≥ 0) and
// D = dTerrain per block (top ≤ 1 < dirt ≤ 4 < stone) — and emits them as
// planes next to the hints (work/gm/gen-gm.mjs; original outputs
// byte-identical). Each vertex gets S (bilinear) and E = max(0, D)
// (trilinear) at its position as two 12-bit codes in the 3 reserved bytes
// (+ mode flag bit 3); the fragment applies the v1 thresholds. Generated
// boundaries are contours of smooth fields: the beach is the H = 2 contour,
// layers in caves/digs are D contours; the dirt specks/stripes of today's
// slopes (block-centre sampling of a vertical depth rule) do not appear.
// Quads near PLAYER edits (a non-sharp edited solid surface block within
// the mf-iso window) and quads of edited/sharp blocks use mf-iso's field,
// with generated blocks as background carrying the gen field (no halo);
// shared vertices are duplicated so each triangle is single-mode.
// Without planes (synthetic scenes) = mf-iso exactly. Geometry = 'hints'.
// Harness tools pass no planes: work/gm/shim.mjs attaches them for the
// bench chunks (production: emitted by the generator with the region).
// δ = 0: E = max(0, D), so dig-wall/cave layer boundaries sit where the
// blocks' own boundaries are (D = 1 halfway between block centres).
import { makeGM, makeGMFragment } from '../work/gm/gm-core.mjs';
import { attachGenPlanes } from '../work/gm/shim.mjs';
const pass = makeGM({ rule: 'none', alpha: 0, delta: 0, fine: false });
export const name = 'gm-hint3';
export const describe = "Generator material hints: S = SEA+2−H (per column) and E = max(0, D) (dTerrain per block) interpolated per vertex (2×12 bits), fragment applies the v1 thresholds; edited zones fall back to mf-iso with the gen field as background; geometry = 'hints'.";
export const apron = 3; // TIMING VARIANT: the unedited GEN_MESH path (no edit within reach); not valid for synthetic scenes
export function mesh(region, scene, core) {
  const r = attachGenPlanes(region);
  return pass(core.decodeMesh(core.meshRegion({ ...r, params: {} })), r);
}
export const fragment = makeGMFragment();
