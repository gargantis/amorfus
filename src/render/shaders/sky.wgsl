// Sky (§8.3): fullscreen triangle, drawn after terrain at depth 0
// (reversed-Z far). A simple zenith→horizon gradient that matches the
// terrain's fog colour at the horizon.

struct SkyFrame {
  inv_view_proj: mat4x4f,
  horizon: vec4f, // rgb = fog colour
  zenith: vec4f,
}

@group(0) @binding(0) var<uniform> sky: SkyFrame;

struct VsOut {
  @builtin(position) clip: vec4f,
  @location(0) ndc: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VsOut {
  let x = f32(i32(vi & 1u) * 4 - 1);
  let y = f32(i32(vi >> 1u) * 4 - 1);
  var out: VsOut;
  // Reversed-Z: the far plane is depth 0; draw the sky exactly there.
  out.clip = vec4f(x, y, 0.0, 1.0);
  out.ndc = vec2f(x, y);
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  let far = sky.inv_view_proj * vec4f(in.ndc, 0.5, 1.0);
  let dir = normalize(far.xyz / far.w);
  let t = clamp(dir.y * 1.6 + 0.25, 0.0, 1.0);
  return vec4f(mix(sky.horizon.rgb, sky.zenith.rgb, t), 1.0);
}
