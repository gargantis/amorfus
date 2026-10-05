// Procedural textures (D-21/§8.3): generated on the GPU at startup —
// nothing downloaded, no licences. cs_main writes sRGB-ENCODED texels into
// mip 0 of an rgba8unorm array; cs_mip builds each next mip by decoding to
// linear, averaging 2×2, and re-encoding. The terrain samples through an
// explicit -srgb view, so filtering happens in linear space.

@group(0) @binding(0) var dst: texture_storage_2d_array<rgba8unorm, write>;
@group(0) @binding(1) var src: texture_2d_array<f32>;

fn hash2(p: vec2u, layer: u32) -> f32 {
  var h = p.x * 374761393u + p.y * 668265263u + layer * 2246822519u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32((h ^ (h >> 16u)) & 0xffffu) / 65535.0;
}

fn vnoise(uv: vec2f, cells: f32, layer: u32) -> f32 {
  let g = uv * cells;
  let i = vec2u(floor(g) % cells);
  let f = fract(g);
  let i1 = (i + vec2u(1u, 0u)) % u32(cells);
  let i2 = (i + vec2u(0u, 1u)) % u32(cells);
  let i3 = (i + vec2u(1u, 1u)) % u32(cells);
  let a = hash2(i, layer);
  let b = hash2(vec2u(i1.x, i.y), layer);
  let c = hash2(vec2u(i.x, i2.y), layer);
  let d = hash2(i3, layer);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

fn srgb_encode(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

fn srgb_decode(c: vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3f(2.4));
  return select(hi, lo, c <= vec3f(0.04045));
}

fn material_colour(uv: vec2f, layer: u32) -> vec3f {
  let n1 = vnoise(uv, 8.0, layer);
  let n2 = vnoise(uv, 32.0, layer + 100u);
  let n = n1 * 0.7 + n2 * 0.3;
  switch layer {
    case 1u: { // grass
      return mix(vec3f(0.13, 0.32, 0.10), vec3f(0.24, 0.47, 0.15), n);
    }
    case 2u: { // dirt
      return mix(vec3f(0.26, 0.17, 0.10), vec3f(0.38, 0.26, 0.16), n);
    }
    case 3u: { // stone
      return mix(vec3f(0.30, 0.30, 0.32), vec3f(0.45, 0.45, 0.47), n);
    }
    case 4u: { // sand
      return mix(vec3f(0.65, 0.57, 0.38), vec3f(0.78, 0.70, 0.49), n);
    }
    case 5u: { // planks: warm stripes along x
      let stripe = 0.75 + 0.25 * sin(uv.y * 50.26548);
      return mix(vec3f(0.40, 0.26, 0.13), vec3f(0.55, 0.38, 0.20), n) * stripe;
    }
    case 6u: { // brick: staggered courses
      let course = floor(uv.y * 8.0);
      let bx = fract(uv.x * 4.0 + select(0.0, 0.5, (i32(course) & 1) == 1));
      let by = fract(uv.y * 8.0);
      let mortar = select(1.0, 0.0, bx < 0.06 || by < 0.1);
      let brick = mix(vec3f(0.48, 0.17, 0.12), vec3f(0.60, 0.24, 0.16), n);
      return mix(vec3f(0.62, 0.60, 0.56), brick, mortar);
    }
    case 7u: { // reserved: neutral checker
      let c = f32((u32(uv.x * 8.0) + u32(uv.y * 8.0)) & 1u);
      return mix(vec3f(0.35), vec3f(0.55), c);
    }
    default: { // 0 = air: debug magenta, never sampled in play
      return vec3f(1.0, 0.0, 1.0);
    }
  }
}

@compute @workgroup_size(8, 8, 1)
fn cs_main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(dst);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let uv = (vec2f(id.xy) + 0.5) / vec2f(dims);
  let linear = material_colour(uv, id.z);
  textureStore(dst, id.xy, id.z, vec4f(srgb_encode(linear), 1.0));
}

// One 2×2 reduction step: src mip N (as a view), dst mip N+1.
@compute @workgroup_size(8, 8, 1)
fn cs_mip(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(dst);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let base = vec2i(id.xy) * 2;
  var acc = vec3f(0.0);
  for (var dy = 0; dy < 2; dy++) {
    for (var dx = 0; dx < 2; dx++) {
      let texel = textureLoad(src, base + vec2i(dx, dy), i32(id.z), 0).rgb;
      acc += srgb_decode(texel);
    }
  }
  textureStore(dst, id.xy, id.z, vec4f(srgb_encode(acc * 0.25), 1.0));
}
