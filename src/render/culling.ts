// §8.3: CPU frustum culling. Planes extracted Gribb–Hartmann style from a
// column-major view-projection matrix (wgpu-matrix layout); an AABB is
// visible unless fully outside one plane.

export type Plane = [number, number, number, number]; // ax+by+cz+d ≥ 0 inside

export interface Aabb {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export function frustumPlanes(vp: Float32Array): Plane[] {
  const m = (r: number, c: number): number => vp[c * 4 + r]!;
  const row = (r: number): Plane => [m(r, 0), m(r, 1), m(r, 2), m(r, 3)];
  const add = (a: Plane, b: Plane): Plane => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
  const sub = (a: Plane, b: Plane): Plane => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
  const r0 = row(0);
  const r1 = row(1);
  const r2 = row(2);
  const r3 = row(3);
  // Reversed-Z with an infinite far plane leaves w+z degenerate; keep the
  // five meaningful planes plus near (w−z for reversed-Z: z' ≤ w).
  const planes = [add(r3, r0), sub(r3, r0), add(r3, r1), sub(r3, r1), add(r3, r2), sub(r3, r2)];
  return planes.filter((p) => Math.hypot(p[0], p[1], p[2]) > 1e-8);
}

export function aabbVisible(planes: readonly Plane[], box: Aabb): boolean {
  for (const [a, b, c, d] of planes) {
    // The AABB corner farthest along the plane normal:
    const px = a >= 0 ? box.max[0] : box.min[0];
    const py = b >= 0 ? box.max[1] : box.min[1];
    const pz = c >= 0 ? box.max[2] : box.min[2];
    if (a * px + b * py + c * pz + d < 0) return false;
  }
  return true;
}
