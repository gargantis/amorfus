// stack — edit-zone material methods (the plug-in point; the contract follows).
//
// A zone method is an object:
//   name     string
//   reach    blocks: GEN quads with a corner within `reach` of an edited,
//            non-sharp, solid surface block are CLAIMED (class ZGEN); 0 =
//            only the edited blocks' own quads (class EDIT) are zone quads
//   layout   'A' (keep-gm: every zone vertex keeps gm's S|E codes) or
//            'B' (own-bytes: the method owns bytes 13–15 of zone vertices;
//            only uncontested GEN quads are claimed)
//   dim      floats per vertex the method stores (study attrs after [cls, S, E])
//   build(ctx)            fills ctx.mesh.attrs[v·attrDim + 3 + k] for zone
//                         vertices; returns per-mesh data (→ ctx.zoneData)
//   fragment(a, info, ctx) → material id, or GEN_TOKEN (0) = "show the
//                         generated material here" (gm's exact contour)
// a = interpolated attrs ([0] class, [1] S, [2] E, [3…] the method's own).
import { GEN_TOKEN, CLS } from './stack-core.mjs';

const isEdit = (a) => a[0] > 1.5 && a[0] < 2.5;

/** Placeholder: production block materials on edited blocks; claimed
 *  generated quads (reach > 0) show the generated material (identity). */
export function ownZone(reach = 0, layout = 'A') {
  return {
    name: `own-r${reach}${layout === 'B' ? 'B' : ''}`, reach, layout, dim: 0,
    build: null,
    fragment(a, info) { return isEdit(a) ? info.ownMat : GEN_TOKEN; },
  };
}

/** COUNTEREXAMPLE (what the rule forbids): every zone quad shows its block's
 *  STORED production material, generated blocks included, so generated|
 *  generated boundaries inside the zone become block staircases again. */
export function storedZone(reach = 3) {
  return {
    name: `stored-r${reach}`, reach, layout: 'A', dim: 0,
    build: null,
    fragment(a, info) { return info.ownMat; },
  };
}

export { GEN_TOKEN, CLS };
