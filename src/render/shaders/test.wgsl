// M0 test shader: a fullscreen triangle with an analytically known colour,
// so the e2e webgpu project can assert pixels through readback.

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VsOut {
  var out: VsOut;
  let x = f32(i32(vi & 1u) * 4 - 1);
  let y = f32(i32(vi >> 1u) * 4 - 1);
  out.pos = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, (y + 1.0) * 0.5);
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  // Centre pixel is exactly (0.25, 0.55, 0.85).
  let base = vec3f(0.25, 0.55, 0.85);
  let tint = (in.uv.x - 0.5) * 0.2 + (in.uv.y - 0.5) * 0.2;
  return vec4f(base + vec3f(tint), 1.0);
}
