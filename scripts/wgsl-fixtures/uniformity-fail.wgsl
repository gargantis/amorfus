// §14 self-test fixture: textureSample inside a non-uniform branch MUST be
// rejected by the checker. If this compiles, the gate is broken.
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var c = vec4f(0.0);
  if (uv.x > 0.5) {
    c = textureSample(t, s, uv);
  }
  return c;
}
