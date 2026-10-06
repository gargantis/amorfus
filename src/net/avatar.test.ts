import { describe, it, expect } from 'vitest';
import { RemoteAvatar } from './avatar';

// §11.6: remote players draw 150 ms behind with Hermite interpolation and
// at most 250 ms of extrapolation; they are not solid.
describe('RemoteAvatar', () => {
  it('interpolates between samples at the render delay', () => {
    const a = new RemoteAvatar();
    a.push(1000, { position: [0, 0, 0], velocity: [10, 0, 0], yaw: 0 });
    a.push(1100, { position: [1, 0, 0], velocity: [10, 0, 0], yaw: 0 });
    // render time 1200 → sample time 1050 → halfway-ish
    const s = a.sample(1200)!;
    expect(s.position[0]).toBeGreaterThan(0.2);
    expect(s.position[0]).toBeLessThan(0.8);
  });

  it('extrapolates with velocity but never beyond 250 ms', () => {
    const a = new RemoteAvatar();
    a.push(1000, { position: [0, 0, 0], velocity: [10, 0, 0], yaw: 0 });
    const s1 = a.sample(1000 + 150 + 100)!; // 100 ms beyond the last sample
    expect(s1.position[0]).toBeCloseTo(1.0, 1);
    const s2 = a.sample(1000 + 150 + 2000)!; // way past: clamped at 250 ms
    expect(s2.position[0]).toBeCloseTo(2.5, 1);
  });

  it('returns null with no samples', () => {
    expect(new RemoteAvatar().sample(5)).toBeNull();
  });
});
