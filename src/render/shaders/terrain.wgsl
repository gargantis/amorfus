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
  params: vec4f,          // x = anisotropy-ready pad, y = time, z = SPIKE border guard, w = SPIKE thin-feature protection
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
  // SPIKE material-borders (throwaway): share of the smooth faces around
  // this corner held by each material; where the pixel sits in its face;
  // the corner's own-material share, kept apart per corner; and which of
  // the face's four neighbours carry the same material.
  @location(5) mw0: vec4f,       // materials 1–4
  @location(6) mw1: vec3f,       // materials 5–7
  @location(7) uv: vec2f,
  @location(8) chot: vec4f,      // 1 at this vertex's corner slot
  @location(9) cw: vec4f,        // own share in that slot
  @location(10) @interpolate(flat) mask: u32,
}

// SPIKE material-borders: 1.0 in the slot of material `m`.
fn one_hot0(m: u32) -> vec4f {
  return select(vec4f(0.0), vec4f(1.0), vec4u(1u, 2u, 3u, 4u) == vec4u(m));
}
fn one_hot1(m: u32) -> vec3f {
  return select(vec3f(0.0), vec3f(1.0), vec3u(5u, 6u, 7u) == vec3u(m));
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
  // SPIKE material-borders: byte 12 keeps the id in bits 0–2; the rest of
  // the word is one 4-bit count per material. A mesh without counts (all
  // zero) falls back to one-hot, which draws exactly as before.
  let mb = in.material;
  let own = mb.x & 7u;
  var c0 = vec4f(f32(mb.x >> 4u), f32(mb.y & 15u), f32(mb.y >> 4u), f32(mb.z & 15u));
  var c1 = vec3f(f32(mb.z >> 4u), f32(mb.w & 15u), f32(mb.w >> 4u));
  var total = c0.x + c0.y + c0.z + c0.w + c1.x + c1.y + c1.z;
  let plain = total == 0.0;
  if (plain) {
    c0 = one_hot0(own);
    c1 = one_hot1(own);
    total = 1.0;
  }
  out.mw0 = c0 / total;
  out.mw1 = c1 / total;
  // Flags: bit 0 sharp, bits 1–2 the corner's (u, v), bits 3–6 the mask.
  // A mesh without counts is all "interior", which draws as before.
  let flags = in.pos_ao.w >> 8u;
  let cu = f32((flags >> 1u) & 1u);
  let cv = f32((flags >> 2u) & 1u);
  out.uv = vec2f(cu, cv);
  out.chot = vec4f((1.0 - cu) * (1.0 - cv), cu * (1.0 - cv), cu * cv, (1.0 - cu) * cv);
  out.cw = out.chot * (dot(out.mw0, one_hot0(own)) + dot(out.mw1, one_hot1(own)));
  out.mask = select((flags >> 3u) & 15u, 15u, plain);
  out.material = own;
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

  let uvx = in.wmod.zy;
  let uvy = in.wmod.xz;
  let uvz = in.wmod.xy;
  let dx1 = dpdx(uvx); let dy1 = dpdy(uvx);
  let dx2 = dpdx(uvy); let dy2 = dpdy(uvy);
  let dx3 = dpdx(uvz); let dy3 = dpdy(uvz);

  // SPIKE material-borders (throwaway). The face's own material has
  // strength 1 at the face centre, 1 or 1/2 at each edge midpoint (does
  // the neighbour there match?) and its counted share at each corner,
  // bilinear in between. `guard` mixes that with the plain interpolation
  // of the corner shares: 1 keeps every block's claim on its own face,
  // lower values smooth wide borders more and shrink lone blocks.
  let own0 = one_hot0(in.material);
  let own1 = one_hot1(in.material);
  let a = abs(in.uv.x - 0.5);
  let b = abs(in.uv.y - 0.5);
  let hi_u = in.uv.x > 0.5;
  let hi_v = in.uv.y > 0.5;
  // nearest corner's own share, recovered from its slot
  let slot = select(select(0, 1, hi_u), select(3, 2, hi_u), hi_v);
  let w_c = clamp(in.cw[slot] / max(in.chot[slot], 1e-4), 0.0, 1.0);
  let e_u = 0.5 + 0.5 * f32((in.mask >> select(0u, 1u, hi_u)) & 1u);
  let e_v = 0.5 + 0.5 * f32((in.mask >> select(2u, 3u, hi_v)) & 1u);
  let dual = (1.0 - 2.0 * a) * (1.0 - 2.0 * b) + 2.0 * a * (1.0 - 2.0 * b) * e_u
    + (1.0 - 2.0 * a) * 2.0 * b * e_v + 4.0 * a * b * w_c;
  let l_own = dot(in.mw0, own0) + dot(in.mw1, own1);
  // a face with no matching neighbour along one axis is a thin feature
  let thin = (in.mask & 3u) == 0u || (in.mask & 12u) == 0u;
  let guard = select(frame.params.z, 1.0, thin && frame.params.w > 0.5);
  let f_own = select(mix(l_own, dual, guard), 1.0, in.mask == 15u);
  // Strongest challenger among the other six, by corner share; what the
  // face's own material does not hold is split in those proportions.
  let o0 = in.mw0 * (vec4f(1.0) - own0);
  let o1 = in.mw1 * (vec3f(1.0) - own1);
  var l_other = o0.x;
  var other = 1u;
  other = select(other, 2u, o0.y > l_other); l_other = max(l_other, o0.y);
  other = select(other, 3u, o0.z > l_other); l_other = max(l_other, o0.z);
  other = select(other, 4u, o0.w > l_other); l_other = max(l_other, o0.w);
  other = select(other, 5u, o1.x > l_other); l_other = max(l_other, o1.x);
  other = select(other, 6u, o1.y > l_other); l_other = max(l_other, o1.y);
  other = select(other, 7u, o1.z > l_other); l_other = max(l_other, o1.z);
  let f_other = (1.0 - f_own) * l_other / max(1.0 - l_own, 1e-4);
  // The border now runs inside triangles, where MSAA cannot reach it, so
  // blend the two across about one pixel.
  let margin = f_own - f_other;
  let own_share = clamp(margin / max(fwidth(margin), 1e-5) + 0.5, 0.0, 1.0);

  var albedo = vec3f(0.0);
  if (own_share > 0.0) {
    let layer = i32(in.material);
    var a = vec3f(0.0);
    if (w.x > 0.03) {
      a += w.x * textureSampleGrad(tex, samp, fract(uvx), layer, dx1, dy1).rgb;
    }
    if (w.y > 0.03) {
      a += w.y * textureSampleGrad(tex, samp, fract(uvy), layer, dx2, dy2).rgb;
    }
    if (w.z > 0.03) {
      a += w.z * textureSampleGrad(tex, samp, fract(uvz), layer, dx3, dy3).rgb;
    }
    albedo += own_share * a;
  }
  if (own_share < 1.0) {
    let layer = i32(other);
    var a = vec3f(0.0);
    if (w.x > 0.03) {
      a += w.x * textureSampleGrad(tex, samp, fract(uvx), layer, dx1, dy1).rgb;
    }
    if (w.y > 0.03) {
      a += w.y * textureSampleGrad(tex, samp, fract(uvy), layer, dx2, dy2).rgb;
    }
    if (w.z > 0.03) {
      a += w.z * textureSampleGrad(tex, samp, fract(uvz), layer, dx3, dy3).rgb;
    }
    albedo += (1.0 - own_share) * a;
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
