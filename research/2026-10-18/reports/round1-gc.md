# Team gc: curved refinement (round 1)

Verdict: **weak**. Best variant: `gc-cc1ed` (approaches/gc-cc1ed.mjs).

## How it works

gc-cc1ed applies one Catmull-Clark (CC) subdivision step to the production 'hints' mesh, but only where shapes were edited. The rest of the mesh is left exactly as production makes it.

Steps:
1. A patched copy of the mesher (work/gc/src/core/mesh/mesher-gc.ts, bundled as work/gc/mesher-gc.mjs) produces the chunk's mesh byte-identical to production. It also exports a control mesh: the production vertices welded per lattice corner, covering the chunk plus a 1-block margin, together with each vertex's constraint box (lo/hi), guard half-width (hw), relax flag (inR), normal and AO.
2. If no owned quad touches the relax set R (cells containing a shape-edited block), it returns the production mesh untouched. All generated terrain takes this path.
3. Otherwise, quads that touch R are subdivided once (each quad becomes 4 child quads, 8 triangles). Face points are centroids; edge points are (v0+v1+Fa+Fb)/4; vertex points are (ΣF + Σv + (n²−2n)S)/n². Creases (sharp-adjacent or non-manifold edges) use crease rules, and sharp-touching or non-manifold vertices stay fixed, so sharp faces stay exactly on their planes.
4. Vertex points are clamped to the mesher's own box (thin-feature guard, D-3 caps, sharp pins). Where a D-3 cap applies, an edge point may not move toward air along the production normal.
5. An unrefined quad that borders refined ones becomes a fan around its centroid, so there are no T-junction cracks.
6. Every position is an exact integer numerator over a small integer denominator, in 1/256-block units, rounded once (exact round-half-up). The result is therefore independent of summation order and of which chunk computes it.
7. Normals are the production normals interpolated bilinearly. AO is interpolated bilinearly. Each child quad keeps its parent block's material, and each child triangle maps to its parent quad's pick record.

Other variants tried: PN triangles and Phong tessellation (interpolating schemes), full Catmull-Clark (approximating), limit projection, two CC levels, and unconstrained CC.

Why the gain is small, in two findings:
- The jaggedness lives in the control vertices, at wavelengths of 2 blocks and longer. A one-ring scheme only damps the shortest of these: by 1/3 for a period-2 staircase and 1/2 for period 3, and almost nothing for the long runs of shallow slopes and circles. Interpolating schemes keep the vertices, so they keep the teeth.
- For built shapes, the binding limit is the mesher's box, not the amount of smoothing. Applying the same CC-limit smoothing without refinement, but clamped to the box, lands where hints already is (terrace-1:2 0.123 vs 0.133, terrace-disc 0.220 vs 0.219, mound 7.7° vs 7.8°). Removing the D-3 caps alone takes terrace-1:2 from 0.133 to 0.015, but breaks the tunnel (0.53) and roof (1.26) checks. Refinement gains only where its new points are not boxed, and that is where it intrudes into clearance.

## Comparison (harness compare.mjs)

| scene | cubes | hints | bevel | gc-cc1ed | gc-cc1e | gc-phong2 |
|---|---|---|---|---|---|---|
| edge-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| edge-1:8 | 0.299 / 0.516 | 0.299 / 0.516 | 0.234 / 0.396 | 0.299 / 0.516 | 0.299 / 0.516 | 0.299 / 0.516 |
| edge-1:5 | 0.283 / 0.487 | 0.283 / 0.487 | 0.192 / 0.303 | 0.283 / 0.487 | 0.283 / 0.487 | 0.283 / 0.487 |
| edge-1:3 | 0.271 / 0.481 | 0.271 / 0.481 | 0.129 / 0.170 | 0.271 / 0.481 | 0.271 / 0.481 | 0.271 / 0.481 |
| edge-1:2 | 0.258 / 0.440 | 0.258 / 0.440 | 0.065 / 0.119 | 0.258 / 0.440 | 0.258 / 0.440 | 0.258 / 0.440 |
| edge-2:3 | 0.276 / 0.554 | 0.276 / 0.554 | 0.119 / 0.218 | 0.276 / 0.554 | 0.276 / 0.554 | 0.276 / 0.554 |
| edge-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.000 / 0.000 | 0.204 / 0.343 | 0.204 / 0.343 | 0.204 / 0.343 |
| disc-r2.4 | 0.286 / 0.619 | 0.286 / 0.619 | 0.160 / 0.329 | 0.286 / 0.619 | 0.286 / 0.619 | 0.286 / 0.619 |
| disc-r4.3 | 0.272 / 0.580 | 0.272 / 0.580 | 0.173 / 0.399 | 0.272 / 0.580 | 0.272 / 0.580 | 0.272 / 0.580 |
| disc-r7.6 | 0.297 / 0.679 | 0.297 / 0.679 | 0.198 / 0.448 | 0.297 / 0.679 | 0.297 / 0.679 | 0.297 / 0.679 |
| line1-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| line1-1:1 | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.102 / 0.166 ACP | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.204 / 0.343 CP |
| line1-1:2 | 0.287 / 0.601 CP | 0.287 / 0.601 CP | 0.214 / 0.373 CP | 0.287 / 0.601 CP | 0.287 / 0.601 CP | 0.287 / 0.601 CP |
| line2-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.011 / 0.011 | 0.204 / 0.343 | 0.204 / 0.343 | 0.204 / 0.343 |
| square-6 | 0.000 / 0.000 | 0.000 / 0.000 | 0.072 / 0.208 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| single | area ×1.00, 1 part | area ×1.00, 1 part | area ×0.25, 1 part A | area ×1.00, 1 part | area ×1.00, 1 part | area ×1.00, 1 part |
| checker | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×0.74, 18 parts A | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×1.00, 18 parts |
| junction3 | 0.296 / 0.661 | 0.296 / 0.661 | 0.147 / 0.318 | 0.296 / 0.661 | 0.296 / 0.661 | 0.296 / 0.661 |
| hill-materials | 0.292 / 0.627 | 0.330 / 0.696 | 0.291 / 0.808 | 0.330 / 0.696 | 0.330 / 0.696 | 0.330 / 0.695 |
| ramp-1:1 | 45.0° / 45.0° ao 0.108 | 0.1° / 0.5° ao 0.103 | 17.0° / 18.4° ao 0.108 | 0.1° / 0.5° ao 0.037 | 0.1° / 0.5° ao 0.036 | 0.1° / 0.5° ao 0.038 |
| ramp-1:2 | 43.0° / 63.4° ao 0.075 | 5.6° / 8.7° ao 0.076 | 24.5° / 33.8° ao 0.076 | 4.4° / 7.9° ao 0.027 | 4.4° / 7.9° ao 0.025 | 4.4° / 7.9° ao 0.026 |
| ramp-1:4 | 34.2° / 76.0° ao 0.041 | 10.6° / 19.6° ao 0.041 | 22.0° / 46.3° ao 0.041 | 9.6° / 19.6° ao 0.014 | 9.6° / 19.6° ao 0.014 | 9.5° / 19.6° ao 0.014 |
| ramp-1:8 | 30.0° / 82.9° ao 0.043 | 11.5° / 26.5° ao 0.029 | 20.2° / 53.2° ao 0.043 | 11.1° / 26.5° ao 0.014 | 11.1° / 26.5° ao 0.013 | 11.1° / 26.5° ao 0.016 |
| ramp-diag-1:2.8 | 46.7° / 76.4° ao 0.070 | 8.1° / 15.8° ao 0.074 | 43.2° / 70.9° ao 0.072 | 6.4° / 15.8° ao 0.028 | 6.4° / 15.8° ao 0.028 | 6.8° / 15.8° ao 0.028 |
| mound-r6.4 | 48.4° / 83.5° ao 0.069 | 7.8° / 20.8° ao 0.075 | 34.5° / 81.4° ao 0.070 | 6.8° / 20.9° ao 0.028 | 6.8° / 23.0° ao 0.028 | 7.0° / 20.8° ao 0.027 |
| pit-r5.4 | 48.3° / 81.5° ao 0.132 | 9.4° / 32.4° ao 0.146 | 36.4° / 69.1° ao 0.132 | 8.3° / 32.5° ao 0.052 | 8.3° / 32.6° ao 0.055 | 8.6° / 32.4° ao 0.056 |
| terrace-disc | 0.291 / 0.728 | 0.219 / 0.486 | 0.206 / 0.490 | 0.211 / 0.489 | 0.178 / 0.426 | 0.215 / 0.466 |
| terrace-1:2 | 0.261 / 0.447 | 0.133 / 0.243 | 0.088 / 0.206 | 0.105 / 0.195 | 0.068 / 0.137 | 0.131 / 0.214 |
| tower-r4.6 | 0.341 / 0.616 | 0.170 / 0.338 | 0.233 / 0.478 | 0.172 / 0.325 | 0.169 / 0.329 | 0.184 / 0.365 |
| hinted-slope-1:4 | 34.2° / 76.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 16.1° / 31.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.014 |
| hinted-hill | 45.7° / 87.7° ao 0.061 | 0.8° / 2.8° ao 0.065 | 34.7° / 81.1° ao 0.061 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.025 |
| floating-block | ok 1.00 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.90 |
| pillar | ok 1.00 | ok 0.40 | ok 0.50 | ok 0.40 | ok 0.40 | ok 0.55 |
| tunnel-1x2 | ok 1.05 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.13 |
| roof-2-high | ok 2.00 | ok 1.90 | ok 2.00 | ok 1.90 | ok 1.90 | ok 1.90 |
| sharp-wall | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 |
| mesh ms (all scenes) | 690 | 765 | 706 | 1415 | 1745 | 3698 |

## Real-terrain bench

```
gc-cc1ed: 30.8 ms mean, 157.9 ms max per chunk (apron 11); 6099 triangles, 3326 vertices per chunk
```



## What it fixes

- Slightly softer outlines on built shapes while meeting every constraint (gc-cc1ed): terrace-1:2 outline std 0.133→0.105 (−21%), max deviation 0.243→0.195.
- Curved built shapes, measured as horizontal cross-sections at four heights (work/gc/fairshade.mjs): mound std 0.119/0.145/0.158/0.207 → 0.112/0.137/0.153/0.190; pit 0.177/0.134/0.112/0.155 → 0.169/0.126/0.105/0.142.
- Silhouettes of built shapes are drawn with half-block segments, so the mound's sky silhouette and the terrace teeth are a little rounder in the close-up side-by-sides.
- If the clearance and thin-feature limits are relaxed (gc-cc1e, not acceptable as is), the same mechanism reaches terrace-1:2 0.068 (−49%) and terrace-disc 0.178 (−19%).
- No regression anywhere it is not applied: generated terrain is byte-identical to production, with 0 extra triangles and an unchanged apron of 3.

## What it does not fix

- Material boundaries, the owner's main complaint: every edge, disc, line, square, junction3 and hill-materials row is identical to hints. A one-wide diagonal line still pinches (P, one part per block). Child quads keep their parent block's material, and on flat ground subdivision does not move a grass|stone staircase at all.
- Long-period staircases: tower-r4.6 0.170→0.172 and terrace-disc 0.219→0.211. Runs of 3 or more blocks are beyond any one-ring scheme (the B-spline response is 0.9 at period 8).
- Shading: area-sampled, GPU-equivalent error equals hints with interpolated normals (mound 6.4° vs 6.6°, pit 8.3° vs 8.3°). It is worse with the refined geometry's own normals (CC: mound 7.6°, pit 10.3°; PN: 8.0°, 11.0°). Smooth shading already hides facets inside a surface.
- AO stripes on generated slopes: the AO field is only interpolated (the AO-roughness drop in the harness is a resolution artifact).
- Generated terrain: it is already smooth through hints. Full CC on real chunks looks identical to hints at 4x triangles (out/gc-cc1/img/terrain-mountain-view.png).
- Interpolating schemes (PN, Phong) keep the production vertices and therefore the teeth: terrace-1:2 0.128–0.131 vs 0.133.

## Failure modes

- The mesher's box is the binding constraint. Clamping CC vertex points to it leaves terrace-1:2 at 0.102–0.105. The same smoothing without refinement, clamped to the box, equals hints (0.123). So refinement only gains where its new points escape the box.
- Unconstrained CC (gc-cc1, gc-cc1e) has three problems. Vertex points leave their dual cell (8–20% of edited-region vertices, up to 0.645 from the lattice corner, which would also overflow the u16 position range at a chunk edge). The pillar's narrowest width at mid-height is 0.381 (< 0.40; the harness's axis-extent check reports 0.398). The 1x2 tunnel's free width over the capsule band drops 0.715→0.603 and the near-wall height 1.898→1.678; the capsule still fits, but with 1.7 cm to spare instead of 4.9 cm.
- Limit projection and two CC levels shrink thin features below their limits: pillar 0.367/0.375, tunnel 0.958/0.968 (harness FAIL), floating block 0.51/0.53, capsule clearance 0.278.
- PN and Phong bulge convex features outward (floating block 0.60→0.80–0.90, pillar 0.40→0.49–0.55). That would narrow openings between convex features; that scene was not tested.
- CC normals computed from the refined geometry are noisier than the production area-weighted normals; for example, ramp-1:1 goes from 0.1° to 1.3° even though its positions get flatter.
- CPU cost: edited chunks take about 2x mesh time in my unoptimized JS (15 built scenes: 165→340 ms summed, +3 to +45 ms per chunk). That risks C-12's 33 ms edit-to-swap budget unless optimized.
- Near-camera level of detail would need remeshing at LOD changes, transition fans, accepting popping, and camera-dependent geometry, which cannot be the shared physics surface.

## Production fit

- **dataPath**: Runs on the CPU in the mesh worker, right after the existing mesher. Steps: export the control mesh (production vertices welded per lattice corner over the chunk plus 1 block, with each vertex's box, hw and inR); apply one CC step to quads touching R; build fans at the border; write the result into the same vertex and index buffers. No new GPU data and no fragment-shader change. Pick records stay unchanged: in the CPU collision copy each refined triangle maps to its parent quad (8 triangles per refined quad instead of 2). The mesher patch only adds outputs; its production bytes are verified identical on all 36 scenes. GPU-side refinement (vertex pulling) would work only for PN and Phong, which bring no gain, because CC needs the one-ring.
- **vertexFormat**: Unchanged 16-byte vertex: position u16 at 1/256, AO u8, flags u8, octahedral normal, material u8. All 3 reserved bytes stay free. Every emitted coordinate is on the 1/256 grid and inside the u16 range (checked on all scenes). The index buffer grows.
- **determinism**: Positions are integer numerators over one small integer denominator, in 1/256 units, rounded once with an exact round-half-up (Math.floor of an exactly representable quotient). They are therefore independent of summation order and invariant under chunk translation. Normals are sums of production normals in fixed ring order, then sqrt and divide. The edge-point cap uses + − × ÷ √ on relative coordinates. Seam test: a built mound across x=32 has 74 shared vertices, and two real-terrain seams have 168 and 161; all have 0 position, normal and AO mismatches and 0 near-misses. The union of the two chunks is watertight, with 0 open edges at the seam.
- **apron**: Edited chunks need 10 + 1 for the CC one-ring = 11 (a 54³ region instead of 52³). Generated chunks are unchanged at 3 (38³), because nothing is refined there. Full-world CC with normals taken from the refined mesh would need 10+2 for edited chunks and 3+2 for generated ones.
- **cpuCost**: Interleaved timing on the 16 bench chunks: hints median 14.6 ms per chunk. Full CC x1: 33.9 ms (+19 ms, 2.3x). PN/Phong: 53 ms (unoptimized). gc-cc1ed: 17.6 ms on generated chunks with no refinement; the extra 3 ms is my study path (bigger region plus control export), which production would skip. Edited chunks: about 2x the mesher time (+3 to +45 ms per chunk in unoptimized JS). The machine was shared with other teams: the hints bench varied from 22.5 to 51.2 ms mean across this session.
- **gpuCost**: Fragment cost is unchanged. Refining everything costs 4.0x triangles (24,397 vs 6,099 per real-terrain chunk), about 4.8 M at R=192, which is 3.2x the 1.5 M budget. Refining near the camera only fits the +25% headroom within r ≈ 55 blocks (4x) or 34 blocks (9x). gc-cc1ed adds 0 on generated terrain and 1.1–3.6x on built scenes (2.47x over all 15 built test scenes). That stays within +25% while edited regions are below about 17% of drawn triangles. Extra vertex work on the i7-1255U iGPU is small (a built chunk goes from about 6k to 15k triangles).
- **physics**: Recommendation: collide with the refined triangles, so what you see is what you hit. The refinement is deterministic and chunk-local, and every refined point stays inside the Chebyshev-1 pick box of its parent quad (minimum margin 0.418 for gc-cc1ed, 0.355 for unconstrained CC), so §9.3 picking still holds. Contact tests per refined quad rise from 2 to 8 triangles. gc-cc1ed keeps the D-3 tunnel (capsule clearance 0.348 vs 0.349; band width 0.724 ≥ 0.70) and the roof gap (1.898). If collision stayed on the coarse mesh instead, the drawn surface would sit 0.011–0.022 rms and at most 0.06–0.11 blocks from the collision surface, and feet would be off by more than 5 cm on 0.2–2.3% of walkable built area. For unconstrained CC: at most 0.21 blocks, and up to 6.5% of area. Any near-camera LOD would force collision onto the coarse mesh, because camera-dependent geometry cannot be shared between peers.
- **editability**: A pure function of the region, recomputed with the chunk on every edit. The refined area follows the relax set R automatically and nothing is stored. A remesh of an edited chunk pays for the CC step. Golden hashes for edited-chunk meshes would change and need re-emitting, which is legitimate before D-24. Generated-chunk goldens are unchanged.

## Combines with

Refinement does not interfere with any material-boundary approach. Child quads keep their parent block's material, so a fragment or seam rule from another team applies on top of gc-cc1ed unchanged. Refinement would only help material boundaries if a rule chose child-quad materials at half-block resolution (an xBR/Scale2x-style rule deciding the 4 children of each block), at the triangle cost measured here (2.5x where applied); this is untested.

The larger lever for built outlines is not refinement but the D-3 clearance cap in the mesher. With caps removed, the existing hints relaxation alone takes terrace-1:2 from 0.133 to 0.015 and terrace-disc to 0.158. A cap that applies only to genuinely narrow openings (for example, a short free-air run along the axis) could get most of that without refinement. That is a mesher-rule change, outside this approach, and its tunnel and room cases must be re-measured.

## Variants tried

- **gc-cc1**: Catmull-Clark x1 on the whole hints mesh; normals area-weighted over the refined quads; AO bilinear; margin 3, apron 13
  - Result: Outline std: terrace-1:2 0.133→0.068, terrace-disc 0.219→0.178, tower 0.170→0.169. Area-sampled shading is worse (mound 6.6°→7.6°, pit 8.3°→10.3°). Harness constraints pass, but the pillar's narrowest width is 0.381 and the 1x2 tunnel's band width drops 0.715→0.603. Material rows identical to hints. 4.0x triangles (24,397 vs 6,099 per real-terrain chunk).
- **gc-cc1b**: gc-cc1 geometry with the production normals interpolated bilinearly
  - Result: Same outlines as gc-cc1. Area-sampled shading equals hints (mound 6.4° vs 6.6°). Vertex-sampled harness shading looks better (mound 7.8°→6.8°), but that is only a sampling artifact.
- **gc-cc1L**: CC x1, then every vertex pushed to the limit surface
  - Result: Outlines: terrace-1:2 0.054, terrace-disc 0.170, tower 0.166. Fails thin features: pillar 0.367, tunnel 0.958, floating block 0.51; capsule clearance 0.278 < 0.300.
- **gc-cc2**: Two CC levels (16x quads), as a ceiling check
  - Result: No better than one level (terrace-1:2 0.067). Fails pillar (0.375) and tunnel (0.968). 16x triangles.
- **gc-cc1g**: CC x1 with vertex points clamped to the mesher's full box (guard, caps, pins)
  - Result: Gain mostly gone: terrace-1:2 0.102, terrace-disc 0.211. Edge points still intrude into the tunnel (band width 0.603).
- **gc-ccv**: No refinement: each hints vertex moved to its CC limit position (1-ring smoothing, 0 extra triangles)
  - Result: Best outlines of all (terrace-1:2 0.038, terrace-disc 0.157, tower 0.159), which shows the gain comes from moving vertices, not from refining. Fails everything thin: floating block 0.30, pillar 0.27, tunnel 0.83. Clamped to the box (work/gc/variant-ccvg.mjs) it returns to hints: 0.123 / 0.220 / 0.163.
- **gc-cc1e**: CC x1 only on quads touching R (shape-edited cells); crack-free fans at the border; production normals interpolated; generated terrain is the production mesh
  - Result: Same outline gain as full CC (0.068 / 0.178 / 0.169) at 2.47x triangles over the 15 built scenes and 1.0x on terrain. Vertex points leave their dual cell (8–20% of edited-region vertices, up to 0.645 from the corner). Pillar narrowest width 0.381; capsule margin cut from 4.9 to 1.7 cm.
- **gc-cc1eg**: gc-cc1e with vertex points clamped to the thin-feature guard (±hw; this equals the cell limit on these scenes)
  - Result: terrace-1:2 0.102, terrace-disc 0.211, tower 0.169. Pillar 0.398 OK. Tunnel band width still 0.603 (capsule 0.317).
- **gc-cc1ed**: gc-cc1e with vertex points clamped to the full mesher box, and edge points not allowed to move toward air where a D-3 cap applies (BEST: meets every constraint)
  - Result: terrace-1:2 0.133→0.105 (−21%), terrace-disc 0.219→0.211 (−4%), tower 0.170→0.172. Mound sections −6 to −9%, pit sections −4 to −9%. Area-sampled shading equals hints. Tunnel capsule clearance 0.348 (hints 0.349), band width 0.724, pillar 0.398, floating block 0.602. Seams bit-identical; 0 extra triangles on terrain.
- **gc-pn2 / gc-pn3**: PN triangles at level 2 / 3 (4x / 9x triangles); crease edges straight; quadratic normals
  - Result: No outline gain (terrace-1:2 0.128/0.127, terrace-disc 0.214/0.211, tower 0.175/0.178). Area-sampled shading worse (mound 8.0°/8.2°, pit 11.0°/11.3°). Convex features bulge outward (floating block 0.80, pillar 0.49).
- **gc-phong2 / gc-phong3**: Phong tessellation (alpha 0.75) at level 2 / 3
  - Result: No outline gain (0.131 / 0.215 / 0.184). Shading equals hints (it uses interpolated normals). Floating block 0.90, pillar 0.55; tunnel bulges into the rock (band width 0.750). Visually indistinguishable from hints.
- **diag (work/gc/diag-caps.mjs)**: Hints rule with the D-3 caps removed and/or k=20; not a deliverable
  - Result: No caps: terrace-1:2 0.015, terrace-disc 0.158, tower 0.167, but tunnel FAIL 0.53 and roof FAIL 1.26. k=20 with caps is worse (terrace-disc 0.251, offset −0.46). The caps are the binding limit on built outlines.

## Open questions

- Would a narrow-opening-only D-3 cap keep the tunnel and room guarantees while letting relaxation straighten terrace outlines? The diagnostic shows the potential (no caps: terrace-1:2 0.015), but the current caps apply to every air cell near an edited solid.
- Only the straight 1x2 tunnel and the flat roof were measured for clearance. Stair tunnels, L-turns and 1-wide gaps between convex features are untested under CC (edge-capped) and PN/Phong (convex bulge).
- Can the CC step be made cheap enough for C-12? The JS here is unoptimized (Map-keyed edges); typed-array topology would likely give 3–5x, but that is not measured.
- Is the 21% outline gain on steep diagonal terraces worth 2.5x triangles in built regions and a second mesh pass? My judgement from the side-by-sides is no: the teeth remain clearly visible.
- Should refinement be revisited only as a carrier for half-block material resolution (connecting one-wide diagonal lines)? That would be a different study.

## Harness issues reported

- Shading rms, AO roughness and crease angles are sampled at vertices, so they depend on mesh resolution. Any approach that adds vertices with interpolated normals or AO scores better without any visible change (ramp-1:2 5.6°→4.4°, AO roughness 0.076→0.025). An area-sampled version that interpolates normals as the GPU does (work/gc/fairshade.mjs) shows equal values.
- The tunnel and pillar checks use vertex extents, so they cannot see a surface intruding between vertices. CC passes 'tunnel 1.00 ok' and 'pillar 0.40 ok' while the free band width falls 0.715→0.603 and the pillar's narrowest width is 0.381. work/gc/clearance.mjs uses slices and rays, including a capsule (r 0.3, h 1.8) fit; work/gc/pickbox2.mjs checks the §9.3 pick box.
- bench.mjs forces one apron on every chunk, so a variant that needs a larger apron only for edited chunks cannot show its real GEN_MESH cost. The bench terrain also has no edits, so bench.mjs cannot exercise edited-region approaches at all.
- Timings are noisy on the shared machine (the hints bench ranged from 22.5 to 51.2 ms mean in one session). work/gc/bench-inter.mjs interleaves approaches per chunk and reports medians.
- run.mjs with --only overwrites results.json with a partial set, after which compare.mjs prints n/a. This is minor, but it caught me once.
- No harness file was edited. Helpers and the patched mesher live in work/gc/ (mesher-gc.ts adds a 'margin' control-mesh export and the per-vertex guard half-width hw; production bytes are verified identical by work/gc/check-same.mjs and work/gc/check-control.mjs).

## Images (in the original run; not kept in this folder)

- out/gc-cc1ed/img/sbs-terrace-1-2.png
- out/gc-cc1ed/img/sbs-mound-low.png
- out/gc-cc1ed/img/sbs-tunnel.png
- out/gc-cc1ed/img/sbs-pit-rim.png
- out/gc-cc1/img/sbs-terrace-disc-top.png
- out/gc-cc1/img/terrain-mountain-view.png
- out/gc-cc1ed/img/terrain-beach-view.png
