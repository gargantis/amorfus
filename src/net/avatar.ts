// §11.6: remote players render 150 ms behind (adaptive 100–200 would
// tune this; MVP fixes 150), Hermite between samples, ≤ 250 ms of
// velocity extrapolation past the newest one.

export interface AvatarSample {
  position: [number, number, number];
  velocity: [number, number, number];
  yaw: number;
}

const RENDER_DELAY_MS = 150;
const MAX_EXTRAPOLATION_MS = 250;
const BUFFER = 32;

export class RemoteAvatar {
  private times: number[] = [];
  private samples: AvatarSample[] = [];
  name = '';
  color = 0;

  push(localTimeMs: number, sample: AvatarSample): void {
    this.times.push(localTimeMs);
    this.samples.push(sample);
    if (this.times.length > BUFFER) {
      this.times.shift();
      this.samples.shift();
    }
  }

  sample(nowMs: number): AvatarSample | null {
    const n = this.times.length;
    if (n === 0) return null;
    const t = nowMs - RENDER_DELAY_MS;
    if (t >= this.times[n - 1]!) {
      // extrapolate from the newest sample, clamped
      const last = this.samples[n - 1]!;
      const dt = Math.min(MAX_EXTRAPOLATION_MS, t - this.times[n - 1]!) / 1000;
      return {
        position: [
          last.position[0] + last.velocity[0] * dt,
          last.position[1] + last.velocity[1] * dt,
          last.position[2] + last.velocity[2] * dt,
        ],
        velocity: last.velocity,
        yaw: last.yaw,
      };
    }
    let i = n - 1;
    while (i > 0 && this.times[i - 1]! > t) i--;
    if (i === 0) return this.samples[0]!;
    const t0 = this.times[i - 1]!;
    const t1 = this.times[i]!;
    const a = this.samples[i - 1]!;
    const b = this.samples[i]!;
    const h = Math.max(1e-3, (t1 - t0) / 1000);
    const u = (t - t0) / (t1 - t0);
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    const out: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      out[k] =
        h00 * a.position[k]! +
        h10 * h * a.velocity[k]! +
        h01 * b.position[k]! +
        h11 * h * b.velocity[k]!;
    }
    // shortest-arc yaw blend
    let dyaw = b.yaw - a.yaw;
    if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    return { position: out, velocity: b.velocity, yaw: a.yaw + dyaw * u };
  }
}
