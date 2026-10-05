// Terrain (§8.3): one pipeline for smooth and sharp. Camera-relative
// positions are rebuilt IN INTEGERS — WGSL may reassociate float chains —
// and the camera's sub-block fraction lives in the view matrix, so no
// float operation mixes a chunk input with the fraction.

struct Frame {
  view: mat4x4f,          // includes the camera's sub-block fraction
  proj: mat4x4f,
  camera_block: vec4i,    // integer block the camera stands in
  cam_mod: vec4f,         // camera_block mod 1024, for texture continuity
  sun_dir: vec4f,         // xyz normalised, w unused
  fog: vec4f,             // x = density k for exp2 fog, yzw = fog colour
  params: vec4f,          // x = anisotropy-ready pad, y = time, zw unused
}

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> chunk_origins: array<vec4i>;
@group(0) @binding(2) var tex: texture_2d_array<f32>;
@group(0) @binding(3) var samp: sampler;

struct VsIn {
  @builtin(instance_index) slot: u32,
  @location(0) pos_ao: vec4u,    // uint16x4: xyz fixed 1/256 (+128), w = AO | flags<<8
  @location(1) oct: vec2f,       // snorm16x2 octahedral normal
  @location(2) material: vec4u,  // u8x4: x = material id
}

struct VsOut {
  @builtin(position) clip: vec4f,
  @location(0) rel: vec3f,       // camera-relative, blocks
  @location(1) normal: vec3f,
  @location(2) ao: f32,
  @location(3) @interpolate(flat) material: u32,
  @location(4) wmod: vec3f,      // world position mod 1024 for triplanar
}

fn oct_decode(e: vec2f) -> vec3f {
  var v = vec3f(e.x, e.y, 1.0 - abs(e.x) - abs(e.y));
  if (v.z < 0.0) {
    let t = vec2f(
      (1.0 - abs(v.y)) * select(-1.0, 1.0, v.x >= 0.0),
      (1.0 - abs(v.x)) * select(-1.0, 1.0, v.y >= 0.0),
    );
    v = vec3f(t.x, t.y, v.z);
  }
  return normalize(v);
}

@vertex
fn vs_main(in: VsIn) -> VsOut {
  let origin = chunk_origins[in.slot].xyz;
  // §8.3: p = (origin − cameraBlock)·256 + pos − 128, all in i32.
  let p = (origin - frame.camera_block.xyz) * 256 + vec3i(in.pos_ao.xyz) - 128;
  let rel = vec3f(p) / 256.0;

  var out: VsOut;
  out.clip = frame.proj * frame.view * vec4f(rel, 1.0);
  out.rel = rel;
  out.normal = oct_decode(in.oct);
  out.ao = f32(in.pos_ao.w & 0xffu) / 255.0;
  out.material = in.material.x;
  out.wmod = rel + frame.cam_mod.xyz; // continuous world coords mod 1024
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  let n = normalize(in.normal);
  // Triplanar with pow(|n|,4) weights (§8.3). Gradients are computed in
  // uniform control flow; planes under 3% are skipped via sampleGrad.
  let w4 = pow(abs(n), vec3f(4.0));
  let w = w4 / (w4.x + w4.y + w4.z);
  let layer = i32(in.material);

  let uvx = in.wmod.zy;
  let uvy = in.wmod.xz;
  let uvz = in.wmod.xy;
  let dx1 = dpdx(uvx); let dy1 = dpdy(uvx);
  let dx2 = dpdx(uvy); let dy2 = dpdy(uvy);
  let dx3 = dpdx(uvz); let dy3 = dpdy(uvz);

  var albedo = vec3f(0.0);
  if (w.x > 0.03) {
    albedo += w.x * textureSampleGrad(tex, samp, fract(uvx), layer, dx1, dy1).rgb;
  }
  if (w.y > 0.03) {
    albedo += w.y * textureSampleGrad(tex, samp, fract(uvy), layer, dx2, dy2).rgb;
  }
  if (w.z > 0.03) {
    albedo += w.z * textureSampleGrad(tex, samp, fract(uvz), layer, dx3, dy3).rgb;
  }

  // Lambert sun + hemispheric ambient, both scaled by AO (§8.3).
  let sun = max(dot(n, frame.sun_dir.xyz), 0.0);
  let hemi = 0.35 + 0.25 * (n.y * 0.5 + 0.5);
  let light = (0.9 * sun + hemi) * in.ao;
  var colour = albedo * light;

  // exp² fog to the horizon colour (§8.3).
  let dist = length(in.rel);
  let f = 1.0 - exp2(-frame.fog.x * frame.fog.x * dist * dist);
  colour = mix(colour, frame.fog.yzw, clamp(f, 0.0, 1.0));
  return vec4f(colour, 1.0);
}
