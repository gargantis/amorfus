import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { frustumPlanes, aabbVisible } from './culling';

// §8.3: CPU frustum culling over chunk AABBs, sorted front to back.
describe('frustum culling', () => {
  // Camera at origin looking down -Z, 90° fov, near 0.1 (reversed-Z infinite far).
  const proj = mat4.perspectiveReverseZ(Math.PI / 2, 1, 0.1);
  const view = mat4.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
  const vp = mat4.multiply(proj, view);
  const planes = frustumPlanes(vp as Float32Array);

  const box = (cx: number, cy: number, cz: number) =>
    ({ min: [cx - 1, cy - 1, cz - 1], max: [cx + 1, cy + 1, cz + 1] }) as const;

  it('keeps a box straight ahead', () => {
    expect(aabbVisible(planes, box(0, 0, -10))).toBe(true);
  });

  it('culls boxes behind the camera', () => {
    expect(aabbVisible(planes, box(0, 0, 10))).toBe(false);
  });

  it('culls boxes far outside the side planes', () => {
    expect(aabbVisible(planes, box(100, 0, -10))).toBe(false);
    expect(aabbVisible(planes, box(-100, 0, -10))).toBe(false);
    expect(aabbVisible(planes, box(0, 100, -10))).toBe(false);
  });

  it('keeps a box that merely straddles a plane', () => {
    // At 90° fov the frustum boundary at z=-10 is x=±10.
    expect(aabbVisible(planes, box(10, 0, -10))).toBe(true);
  });
});
