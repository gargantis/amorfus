// gc: Phong tessellation (alpha 0.75) at level 3 over the default rule mesh (interpolating:
// the production vertices stay; triangles bulge along the vertex normals).
import { controlMesh, topology, classify, refineTriangles } from "../work/gc/lib-gc.mjs";
export const name = "gc-phong3";
export const describe = "Phong tessellation (alpha 0.75) at level 3 (9 triangles per triangle) on the hints mesh; crease edges straight, sharp quads flat; patch normals; AO linear.";
export const apron = 13;
export function mesh(region) {
  const { c } = controlMesh(region);
  const t = topology(c);
  const cls = classify(c, t);
  return refineTriangles(c, t, cls, { kind: "phong", L: 3 });
}
