// Selection outline and ghost cube (§8.3): a line-list pipeline sharing
// the terrain frame uniforms. Positions arrive camera-relative in blocks.

struct Frame {
  view: mat4x4f,
  proj: mat4x4f,
  camera_block: vec4i,
  cam_mod: vec4f,
  sun_dir: vec4f,
  fog: vec4f,
  params: vec4f,
}

@group(0) @binding(0) var<uniform> frame: Frame;

struct VsIn {
  @location(0) rel: vec3f,
  @location(1) color: vec4f,
}

struct VsOut {
  @builtin(position) clip: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.clip = frame.proj * frame.view * vec4f(in.rel, 1.0);
  out.color = in.color;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  return in.color;
}
