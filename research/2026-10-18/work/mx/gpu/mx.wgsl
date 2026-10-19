// mx contour codes, fragment side (WebGPU core). In the terrain shader this is
// called from fs_main with the chunk-local position (an extra vec3f varying,
// rebuilt exactly from pos_ao in the vertex shader), the interpolated normal
// and the chunk's slot; here a compute entry evaluates test points.
//   texels: per chunk r32uint (32 + 2·M)³, M = 3:
//     bits 0-2 material, 3 sharp, 4-9 exposed toward d (+x −x +y −y +z −z),
//     10-15 has-code(d), 16-31 code base index
//   codes:  array<vec2u>, 64 bits per (surface block, direction):
//     w0 bits 0-1 count (3 = lone block → disc), passage 0 at bits 2-30,
//     passage 1 bit 0 at w0 bit 31, bits 1-28 in w1 bits 0-27;
//     passage = aq 6 | bq 6 | hasM 1 | mx 5 | my 5 | left 3 | right 3
@group(0) @binding(0) var texels: texture_3d<u32>;
@group(0) @binding(1) var<storage, read> codes: array<vec2u>;
@group(0) @binding(2) var<storage, read> pts: array<vec4f>;
@group(0) @binding(3) var<storage, read> nrms: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> outm: array<u32>;
@group(0) @binding(5) var<storage, read_write> fetches: array<u32>;

const MARGIN: i32 = 3;
const NT: i32 = 38;
const SEARCH: i32 = 2;
const YBIAS: f32 = 0.5;

fn perim(q: u32) -> vec2f {
  let p = f32(q & 63u) / 16.0;
  if (p < 1.0) { return vec2f(p, 0.0); }
  if (p < 2.0) { return vec2f(1.0, p - 1.0); }
  if (p < 3.0) { return vec2f(3.0 - p, 1.0); }
  return vec2f(0.0, 4.0 - p);
}
fn cross2(a: vec2f, b: vec2f) -> f32 { return a.x * b.y - a.y * b.x; }
fn left_of(b: u32, f: vec2f) -> bool {
  let A = perim(b & 63u);
  let B = perim((b >> 6u) & 63u);
  if (((b >> 12u) & 1u) == 0u) { return cross2(B - A, f - A) > 0.0; }
  let Mp = vec2f(f32((b >> 13u) & 31u), f32((b >> 18u) & 31u)) / 32.0;
  let s1 = cross2(Mp - A, f - A);
  let s2 = cross2(B - Mp, f - Mp);
  let turn = cross2(Mp - A, B - Mp);
  return select(s1 > 0.0 || s2 > 0.0, s1 > 0.0 && s2 > 0.0, turn > 0.0);
}
fn eval_code(c: vec2u, own: u32, f: vec2f) -> u32 {
  let n = c.x & 3u;
  if (n == 3u) { let d = f - vec2f(0.5); return select((c.x >> 2u) & 7u, own, dot(d, d) < 0.25); }
  let b0 = (c.x >> 2u) & 0x1fffffffu;
  if (n == 1u) { return select((b0 >> 26u) & 7u, (b0 >> 23u) & 7u, left_of(b0, f)); }
  let b1 = ((c.x >> 31u) & 1u) | ((c.y << 1u) & 0x1ffffffeu);
  if (left_of(b0, f)) { return (b0 >> 23u) & 7u; }
  if (!left_of(b1, f)) { return (b1 >> 26u) & 7u; }
  return (b0 >> 26u) & 7u;
}
fn texel(q: vec3i) -> u32 {
  let t = q + vec3i(MARGIN);
  if (any(t < vec3i(0)) || any(t >= vec3i(NT))) { return 0u; }
  // the volume is stored y-major (index (y·N + z)·N + x, like the region):
  // texture width = x, height = z, depth = y
  return textureLoad(texels, vec3i(t.x, t.z, t.y), 0).x;
}
fn cell(a: i32, cuv: vec2i, l: i32) -> vec3i {
  if (a == 0) { return vec3i(l, cuv.y, cuv.x); }  // (z, y) in-plane
  if (a == 1) { return vec3i(cuv.x, l, cuv.y); }  // (x, z)
  return vec3i(cuv.x, cuv.y, l);                  // (x, y)
}
// material of the fragment, or 0xffffffff = keep the quad's own material
fn mx_material(p: vec3f, n: vec3f, nf: ptr<function, u32>) -> u32 {
  let an = abs(n);
  var a = 2; var s = 1;
  if (an.y >= YBIAS * max(an.x, an.z)) { a = 1; s = select(-1, 1, n.y >= 0.0); }
  else if (an.x >= an.z) { a = 0; s = select(-1, 1, n.x >= 0.0); }
  else { a = 2; s = select(-1, 1, n.z >= 0.0); }
  let d = u32(a * 2 + select(1, 0, s > 0));
  var uv: vec2f; var pa: f32;
  if (a == 0) { uv = p.zy; pa = p.x; } else if (a == 1) { uv = p.xz; pa = p.y; } else { uv = p.xy; pa = p.z; }
  let cuv = vec2i(floor(uv));
  let lp = i32(floor(pa - 0.5 * f32(s)));
  let bit = 1u << (4u + d);
  var t = texel(cell(a, cuv, lp));
  *nf = 1u;
  var found = false;
  if ((t & 7u) != 0u) {
    if ((t & bit) != 0u) { found = true; }
    else {
      for (var k = 1; k <= SEARCH; k++) {
        t = texel(cell(a, cuv, lp + k * s)); *nf += 1u;
        if ((t & 7u) == 0u) { break; }
        if ((t & bit) != 0u) { found = true; break; }
      }
    }
  } else {
    for (var k = 1; k <= SEARCH; k++) {
      t = texel(cell(a, cuv, lp - k * s)); *nf += 1u;
      if ((t & 7u) != 0u) { found = true; break; }
    }
  }
  if (!found || (t & 8u) != 0u) { return 0xffffffffu; }
  let mask = (t >> 10u) & 63u;
  if ((mask & (1u << d)) == 0u) { return t & 7u; }
  let idx = (t >> 16u) + countOneBits(mask & ((1u << d) - 1u));
  *nf += 1u;
  return eval_code(codes[idx], t & 7u, uv - vec2f(cuv));
}
@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&outm)) { return; }
  var nf = 0u;
  outm[i] = mx_material(pts[i].xyz, nrms[i].xyz, &nf);
  fetches[i] = nf;
}
