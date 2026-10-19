// Reference copy of the production rule under the gn prefix, so same-load
// timings write to out/gn-ref-hints/ instead of the shared baseline folder.
export const name = 'gn-ref-hints';
export const describe = 'Production default (hints) — timing reference only.';
export function mesh(region, scene, h) {
  return h.decodeMesh(h.meshRegion({ ...region, params: {} }));
}
