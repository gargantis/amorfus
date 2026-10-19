# Team gn: smooth AO + normals (round 1)

Verdict: **strong**. Best variant: `gn-best` (approaches/gn-best.mjs).

## How it works

Post-processing of the production (hints) mesh. Positions, indices, materials and pick records stay byte-identical; only the existing AO byte and octahedral normal are recomputed.

AO: production counts solid blocks in a 4x4x4 window fixed at the vertex's lattice corner, so it is a per-corner step function, and an exact generated plane shows block bands. gn-best evaluates a 4-block-wide box filter at the vertex's ACTUAL quantised position (blocks c-3..c+2, piecewise-linear weights from the offset). It reads a partial-volume field instead of raw occupancy: clamp(1/2 + 4*rho, 0, 1) for generated blocks (HINT_SCALE = 4, so 4*rho is about the signed density in blocks), and occupancy for shape-edited blocks. AO = clamp(1 - 4.8*max(0, F - 1/2)^2, 0.55, 1). The quadratic onset keeps production's values at real concave edges (F = 0.75 gives 0.70; a corner, F = 0.875, gives 0.55) but suppresses the small F wobble that binary built staircases leave. A 4-wide box also exactly cancels the period-4 and period-2 stair harmonics.

Normals: production area-weighted normals everywhere except the edit zone: cells with a non-sharp shape-edited block within 2 blocks and no sharp block in the cell. There the normal is the mean of unit area normals over the 3-ring of mesh edges, computed on the PRE-relaxation (guarded, capped) positions. Because it follows mesh connectivity, separate surfaces never mix (a ledge over ground, a ceiling over a floor). Using pre-relaxation positions keeps its reach at 7 blocks, inside the existing apron 10.

Generated terrain keeps production normals, which are already exact there (0.0 deg on the hinted plane, 0.8 deg on the hill).

A production-shaped fast path (partial-volume array over chunk +/- 3, prefix-sum zone test, pre-relaxation normals only for quads within 8 blocks of a smooth edit) is byte-identical to the straightforward implementation: work/gn/fastsame.mjs on 70 meshes, work/gn/boxsame.mjs on 42.

## Comparison (harness compare.mjs)

| scene | cubes | hints | bevel | gn-best | gn-ao | gn-bevel |
|---|---|---|---|---|---|---|
| edge-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| edge-1:8 | 0.299 / 0.516 | 0.299 / 0.516 | 0.234 / 0.396 | 0.299 / 0.516 | 0.299 / 0.516 | 0.234 / 0.396 |
| edge-1:5 | 0.283 / 0.487 | 0.283 / 0.487 | 0.192 / 0.303 | 0.283 / 0.487 | 0.283 / 0.487 | 0.192 / 0.303 |
| edge-1:3 | 0.271 / 0.481 | 0.271 / 0.481 | 0.129 / 0.170 | 0.271 / 0.481 | 0.271 / 0.481 | 0.129 / 0.170 |
| edge-1:2 | 0.258 / 0.440 | 0.258 / 0.440 | 0.065 / 0.119 | 0.258 / 0.440 | 0.258 / 0.440 | 0.065 / 0.119 |
| edge-2:3 | 0.276 / 0.554 | 0.276 / 0.554 | 0.119 / 0.218 | 0.276 / 0.554 | 0.276 / 0.554 | 0.119 / 0.218 |
| edge-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.000 / 0.000 | 0.204 / 0.343 | 0.204 / 0.343 | 0.000 / 0.000 |
| disc-r2.4 | 0.286 / 0.619 | 0.286 / 0.619 | 0.160 / 0.329 | 0.286 / 0.619 | 0.286 / 0.619 | 0.160 / 0.329 |
| disc-r4.3 | 0.272 / 0.580 | 0.272 / 0.580 | 0.173 / 0.399 | 0.272 / 0.580 | 0.272 / 0.580 | 0.173 / 0.399 |
| disc-r7.6 | 0.297 / 0.679 | 0.297 / 0.679 | 0.198 / 0.448 | 0.297 / 0.679 | 0.297 / 0.679 | 0.198 / 0.448 |
| line1-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| line1-1:1 | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.102 / 0.166 ACP | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.102 / 0.166 ACP |
| line1-1:2 | 0.287 / 0.601 CP | 0.287 / 0.601 CP | 0.214 / 0.373 CP | 0.287 / 0.601 CP | 0.287 / 0.601 CP | 0.214 / 0.373 CP |
| line2-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.011 / 0.011 | 0.204 / 0.343 | 0.204 / 0.343 | 0.011 / 0.011 |
| square-6 | 0.000 / 0.000 | 0.000 / 0.000 | 0.072 / 0.208 | 0.000 / 0.000 | 0.000 / 0.000 | 0.072 / 0.208 |
| single | area ×1.00, 1 part | area ×1.00, 1 part | area ×0.25, 1 part A | area ×1.00, 1 part | area ×1.00, 1 part | area ×0.25, 1 part A |
| checker | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×0.74, 18 parts A | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×0.74, 18 parts A |
| junction3 | 0.296 / 0.661 | 0.296 / 0.661 | 0.147 / 0.318 | 0.296 / 0.661 | 0.296 / 0.661 | 0.147 / 0.318 |
| hill-materials | 0.292 / 0.627 | 0.330 / 0.696 | 0.291 / 0.808 | 0.330 / 0.696 | 0.330 / 0.696 | 0.291 / 0.808 |
| ramp-1:1 | 45.0° / 45.0° ao 0.108 | 0.1° / 0.5° ao 0.103 | 17.0° / 18.4° ao 0.108 | 0.6° / 1.6° ao 0.011 | 0.1° / 0.5° ao 0.020 | 0.1° / 0.6° ao 0.020 |
| ramp-1:2 | 43.0° / 63.4° ao 0.075 | 5.6° / 8.7° ao 0.076 | 24.5° / 33.8° ao 0.076 | 0.7° / 1.1° ao 0.018 | 5.6° / 8.7° ao 0.033 | 0.7° / 1.0° ao 0.022 |
| ramp-1:4 | 34.2° / 76.0° ao 0.041 | 10.6° / 19.6° ao 0.041 | 22.0° / 46.3° ao 0.041 | 3.0° / 6.6° ao 0.016 | 10.6° / 19.6° ao 0.030 | 2.9° / 5.1° ao 0.015 |
| ramp-1:8 | 30.0° / 82.9° ao 0.043 | 11.5° / 26.5° ao 0.029 | 20.2° / 53.2° ao 0.043 | 7.3° / 13.5° ao 0.011 | 11.5° / 26.5° ao 0.022 | 7.2° / 12.0° ao 0.015 |
| ramp-diag-1:2.8 | 46.7° / 76.4° ao 0.070 | 8.1° / 15.8° ao 0.074 | 43.2° / 70.9° ao 0.072 | 4.6° / 8.5° ao 0.029 | 8.1° / 15.8° ao 0.048 | 8.5° / 13.2° ao 0.031 |
| mound-r6.4 | 48.4° / 83.5° ao 0.069 | 7.8° / 20.8° ao 0.075 | 34.5° / 81.4° ao 0.070 | 9.3° / 33.5° ao 0.019 | 7.8° / 20.8° ao 0.040 | 8.9° / 31.2° ao 0.020 |
| pit-r5.4 | 48.3° / 81.5° ao 0.132 | 9.4° / 32.4° ao 0.146 | 36.4° / 69.1° ao 0.132 | 9.9° / 38.0° ao 0.081 | 9.4° / 32.4° ao 0.071 | 9.4° / 36.9° ao 0.086 |
| terrace-disc | 0.291 / 0.728 | 0.219 / 0.486 | 0.206 / 0.490 | 0.219 / 0.486 | 0.219 / 0.486 | 0.206 / 0.490 |
| terrace-1:2 | 0.261 / 0.447 | 0.133 / 0.243 | 0.088 / 0.206 | 0.133 / 0.243 | 0.133 / 0.243 | 0.088 / 0.206 |
| tower-r4.6 | 0.341 / 0.616 | 0.170 / 0.338 | 0.233 / 0.478 | 0.170 / 0.338 | 0.170 / 0.338 | 0.233 / 0.478 |
| hinted-slope-1:4 | 34.2° / 76.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 16.1° / 31.0° ao 0.041 | 0.0° / 0.0° ao 0.000 | 0.0° / 0.0° ao 0.000 | 2.3° / 3.8° ao 0.006 |
| hinted-hill | 45.7° / 87.7° ao 0.061 | 0.8° / 2.8° ao 0.065 | 34.7° / 81.1° ao 0.061 | 0.8° / 2.8° ao 0.000 | 0.8° / 2.8° ao 0.001 | 4.7° / 11.4° ao 0.008 |
| floating-block | ok 1.00 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 |
| pillar | ok 1.00 | ok 0.40 | ok 0.50 | ok 0.40 | ok 0.40 | ok 0.50 |
| tunnel-1x2 | ok 1.05 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 |
| roof-2-high | ok 2.00 | ok 1.90 | ok 2.00 | ok 1.90 | ok 1.90 | ok 2.00 |
| sharp-wall | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 |
| mesh ms (all scenes) | 690 | 765 | 706 | 980 | 980 | 854 |

## Real-terrain bench

```
gn-best: 49.8 ms mean, 232.8 ms max per chunk (apron 10); 6099 triangles, 3326 vertices per chunk
```



## What it fixes

- AO banding on generated (hinted) terrain, the dominant visible surface artifact on real terrain. With AO forced to 1 the hints geometry was already smooth (work/gn/terrain-mountain-hints-noao.png). AO roughness: exact plane hinted-slope-1:4 0.041 -> 0.000; hinted-hill 0.065 -> 0.000; real-terrain bench chunks, all vertices, mountain 0.072 -> 0.021 and beach 0.097 -> 0.002. The stripes are gone in both bench views.
- Block-shaped AO blotches on built shapes. AO roughness: ramp-1:1 0.103 -> 0.011, ramp-1:2 0.076 -> 0.018, ramp-1:4 0.041 -> 0.016, ramp-1:8 0.029 -> 0.011, diagonal 0.074 -> 0.029, mound 0.075 -> 0.019, pit 0.146 -> 0.081 (the pit is a real concavity).
- Lumps and terraces in the shading of built (edited) shapes. High-frequency normal error: ramp-1:2 5.7 -> 0.5 deg, ramp-1:4 6.4 -> 1.5, ramp-1:8 5.1 -> 1.9, diagonal 6.5 -> 3.0, mound 5.4 -> 3.3, pit 6.4 -> 3.7. Harness shading rms: 1:2 5.6 -> 0.7 deg, 1:4 10.6 -> 3.0, diagonal 8.1 -> 4.6. The mound reads as a smooth dome; the tower loses its vertical stripes.
- Keeps AO's purpose (work/gn/aocheck.mjs, production vs gn-best): wall foot 0.70 vs 0.76, inside corner 0.55 vs 0.55, under a 1-high ledge 0.70 vs 0.70, 1-high gap 0.70 vs 0.70, 1x2 tunnel floor 0.55 vs 0.55, open flat 1.00 vs 1.00.
- Answers the bevel question with numbers. gn shading on bevel geometry cuts shading error from 17-43 deg to 0.1-9.4 deg, but terraced silhouettes and occlusion steps remain, and on generated ground it stays worse than gn-best (hinted-hill 4.7 vs 0.8 deg). Smooth shading removes bevel's facets but not its terraces.

## What it does not fix

- Material boundaries, the owner's stated key issue. Every material row equals hints: edge std 0.20-0.30 blocks at every slope, discs 0.27-0.30, junction3 0.296. 1-wide diagonal lines still split per block and pinch (line1-1:1 and 1:2 flagged CP). Shading cannot move a material seam.
- Geometry and silhouettes. Positions are untouched, so terrace-disc 0.219, terrace-1:2 0.133 and tower-r4.6 0.170 outline jaggedness are unchanged, and stepped silhouettes remain on built ramps and the bevel rule.
- Terraces wider than the 3-ring on gentle built slopes. ramp-1:8 keeps 8-block treads (7.3 deg rms, high-frequency 1.9 deg); ramp-1:4 still shows soft bands (3.0 deg rms). Relaxed-position rings (gn-wide) do better (1.7 / 5.8 deg) but need apron 13 where edits are near.
- Curved builds' crease with the ground. Mound and pit harness rms gets slightly worse (7.8 -> 9.3 deg, max 20.8 -> 33.5; pit 9.4 -> 9.9) because the 3-ring blurs the build-to-ground crease on the lowest row, even though their lumpiness drops 35-40%.
- Collision and picking: unchanged by design.

## Failure modes

- Wide density-gradient normals (gn-grad, sigma 2) are unusable on built content. Under thin features near other mass the smoothed field is dominated by the far mass and the normal flips more than 90 deg: overhang 561 of 2211 vertices, roof-2-high 141, a slab 1 above ground 289, two walls 1 apart 120, a hollow house 64. Ledge undersides render lit (out/gn-grad/img/cmp-overhang-hints-grad-best.png). It still scored best on every harness geometry scene, which is why work/gn/flips.mjs exists.
- Mesh-derived partial volume weakens overhang AO: relaxed thin ledges lose volume, so under-ledge AO is 0.77-0.93 instead of 0.70-0.85. A dead-zone AO combined with it removed overhang darkening entirely (1.00).
- Any AO formula that switches only near edits creates a lighter halo around builds placed in natural hollows (valley floor about 0.91 vs 0.82 inside the zone). Avoided by one formula everywhere.
- Gradient-normalised hint partial volume (rhon) is polluted next to edits, because edited blocks' rho = +/-1 inflates the cell gradient: wall-foot AO weakens to 0.77 from 0.70.
- The quadratic onset thins contact shadows: 1 block from a wall foot 0.93 vs production 0.85; inside corner at 2 blocks 0.81 vs 0.75. This is an art change, not an error.
- Narrow kernels (cubic B-spline sigma 1, tent) alias the binary staircase: AO roughness 0.061 / 0.026 on the exact plane. The narrow B-spline gradient normal is worse than production everywhere (ramp-1:2 12.7 deg).
- A 1-wide pillar's 3-ring normals deviate up to 69 deg from its area normals (12 of 1117 vertices): the ring wraps around a 1-block column.
- Found and fixed during the study: stamping the ring search with the corner id made a corner emitted for a second material see its neighbours as already visited. That produced 5-10 shared-vertex normal mismatches per chunk boundary in work/gn/seams.mjs until replaced by a global counter plus a per-corner cache.

## Production fit

- **dataPath**: CPU, inside the mesh worker's meshRegion, after offsets are quantised. No new GPU data.
(1) Partial-volume array over chunk +/- 3 (38^3): clamp(1/2 + 4*rho, 0, 1) for generated blocks, occupancy for shape-edited ones.
(2) For each emitted corner: separable box weights from its quantised offset, 125 multiply-adds give F, then AO = clamp(1 - 4.8*max(0, F - 1/2)^2, 0.55, 1), written to the existing AO byte.
(3) Only when a non-sharp shape edit exists: a prefix-sum table of non-sharp edited blocks for the zone test; area normals of the pre-relaxation positions for quads within 8 blocks of such an edit; and for each zone corner a breadth-first 3-ring mean, written to the existing octahedral normal.
Reference implementation: work/gn/src/core/mesh/mesher.ts (fastShade path), bundled as work/gn/mesher-gn.mjs.
- **vertexFormat**: Unchanged 16 B vertex: AO u8 (byte 6) and octahedral snorm16x2 normal (bytes 8-11) get new values; positions, flags, material and the 3 reserved bytes are untouched. No per-quad buffer, no texture, no shader change. Same vertex and triangle counts (3326 vertices, 6099 triangles per bench chunk).
- **determinism**: Stored values use only + - x / sqrt and comparisons, plus the existing Math.round quantisation and integer index arithmetic, in fixed loop orders. The ring search visits in the fixed -x,+x,-y,+y,-z,+z slot order. Kernel weights are polynomials of quantised offsets; no exp, pow, trig or hypot.
Verified: (a) default params are byte-identical to the repo mesher on 72 scene meshes (work/gn/same.mjs); (b) the fast path is byte-identical to the reference path on 70 meshes, including random edits with sharp blocks (fastsame.mjs); (c) restricting the pre-relaxation pass to the edit box changes no bytes on 42 meshes (boxsame.mjs); (d) chunk seams (seams.mjs): every vertex shared by adjacent chunks is byte-identical on x, y and z boundaries, with aprons 3/3, 10/10 and the mixed 10/3 case, and 40-162 shared vertices per pair exercising the edit-zone path. Mesh goldens must be re-emitted (allowed before the D-24 freeze).
- **apron**: Unchanged: GEN_MESH stays at 3 with no edit within reach and 10 otherwise.
AO reads blocks within 3 of the corner (window c-3..c+2), which fits apron 3. Edit-zone normals read at most 7 blocks (3 ring steps, plus 1 for the area normal, plus the starting offset's cell, guard and D-3 caps). They exist only where a non-sharp edit is within 3 of the cell, which already forces apron 10.
The dirty set is unchanged, since the reach of 7 is no more than k+3.
Alternatives: relaxed-position rings (gn-wide) would need apron 13 and a wider dirty set; gn-bevel would need about 7 instead of bevel's 3.
- **cpuCost**: Node, interleaved min-of-15 over the 16 bench chunks (work/gn/timing3.mjs):
- apron 3, unedited: 5.38 -> 6.61 ms, +1.2 ms (about +20% of meshing, about +10% of a whole GEN_MESH job including 4-6 ms of generation).
- apron 10, unedited: +0.6 ms.
Edited chunks, min-of-25 (timing2.mjs):
- one placed block: 15.1 -> 18.4 ms
- built mound plus trench (866 edit-zone vertices): 15.7 -> 19.4 ms
- 16x8x16 hollow house (2036 edit-zone vertices): 18.6 -> 21.8 ms
That is about +3.3 ms, mostly fixed passes.
The pathological case of 3000 random edits in one chunk (nearly every vertex in the zone, measured with the earlier gradient normals) was about 2x.
The harness bench line is unreliable under the current machine load: the same hints reference read 28.6, 35.0, 44.8 and 32.6 ms mean across runs.
- **gpuCost**: Zero: identical vertex layout, identical shader (it already interpolates AO and the normal), identical triangle and vertex counts, no extra fetches or texture reads per fragment.
- **physics**: Nothing changes: positions, indices and pick records are byte-identical to production on every scene (same.mjs compares them under the gn params). Collision, picking and the D-3 battery are unaffected; constraint scenes pass with production's values (floating 0.60, pillar 0.40, tunnel 1.00, roof 1.90, sharp 0).
- **editability**: An edit dirties exactly the chunks it dirties today, since the reach of 7 fits inside the existing dirty reach. Each edited-chunk remesh costs about +3.3 ms (Node), so C-12's 33 ms p95 edit-to-swap needs re-measuring in the real worker pool. Sharp builds keep production normals, so crisp intent is respected. No stored state and nothing synced.

## Combines with

Orthogonal to every material-boundary approach. gn writes only the AO byte and normal, computed after positions are final, and uses no reserved vertex bytes. So it stacks with fragment-side material blending, per-vertex material weights, or position-based seam shifts, and automatically shades whatever positions another rule produces (its AO is evaluated at the actual position, and its rings follow the mesh).

It also pairs with any geometry change that flattens built slopes (fewer residual 1:4/1:8 terraces for the rings to hide). If the bevel rule survives anywhere, gn shading should replace its faceted flag.

The AO part (gn-ao: box at the actual position over the hint partial volume) is independent, carries the biggest visible win on real terrain, and could ship alone. The edit-zone normals add built-shape smoothing on top.

## Variants tried

- **lattice-anchored vs actual-position kernels (box/tent/B-spline over binary occupancy)**: Evaluate the AO kernel at the vertex's actual quantised position instead of the lattice corner; compare a 4-wide box, a tent of half-width 2 and a cubic B-spline (support 4).
  - Result: AO roughness on the exact plane hinted-slope-1:4: box 0.000, tent 0.026, B-spline 0.061 (production 0.041); real terrain (mountain): box 0.017, tent 0.028, B-spline 0.046 (production 0.072). Narrow kernels alias the staircase; the 4-wide box cancels period-4 and period-2 stair harmonics.
- **partial-volume fields: rho / rhon (gradient-normalised) / mesh-derived / hybrid**: Feed the box kernel partial volume instead of 0/1: 1/2 + 4*rho for generated blocks; optionally divided by the cell's density gradient; or occupancy +/- each surface quad's mean offset (mesh PV) for edited blocks.
  - Result: rho and rhon tie on terrain (0.016 / 0.008). rhon is polluted next to edits (wall-foot AO 0.77 vs 0.70). Mesh PV improves built-shape AO roughness (mound 0.040 -> 0.013) but weakens overhang darkening (0.77-0.93 vs 0.70-0.85) and needs apron +2. Chose rho (generated) + occupancy (edited).
- **gn-ao (AO only, production linear curve)**: Box AO over the rho/occupancy partial volume; production 1 - 1.2*max(0, F - 1/2); production normals.
  - Result: hinted-slope AO roughness 0.041 -> 0.000, hinted-hill 0.065 -> 0.001, real terrain mountain/beach 0.072/0.097 -> 0.016/0.008. Every concave check within 0.03 of production. Built shapes improve only partly (mound 0.075 -> 0.040, still blotchy).
- **dead-zone AO (bias 0.6, gain 2), global or near edits only**: Ignore F below 0.6 and steepen above it, so F = 0.75 and 0.875 keep their production values.
  - Result: Built-ramp AO roughness -> 0.000-0.003. With mesh PV it removed overhang darkening entirely (1.00). The near-edit-only version would leave lighter halos around builds in natural hollows (valley floor 0.91 vs 0.82). Replaced by the quadratic onset.
- **quadratic onset (gain 4.8)**: AO = 1 - 4.8*max(0, F - 1/2)^2 everywhere; no zone switch.
  - Result: Concave values preserved: wall foot 0.76, inside corner 0.55, under ledge 0.70, 1-high gap 0.70, tunnel floor 0.55. Built AO roughness halves again (ramp-1:4 0.030 -> 0.016, mound 0.040 -> 0.019). Contact shadow thinner: 1 block from a wall foot 0.93 vs 0.85.
- **gn-grad: wide B-spline density-gradient normals (sigma 1, 1.5, 2, 2.5, 3) near edits**: n = -grad(B-spline_sigma * partial volume) at the actual position; sigma 2 reads 8^3 blocks, no extra apron.
  - Result: Best harness numbers on built slopes (sigma 2: 1:2 0.1 deg, diagonal 1.5 deg, 1:4 4.2 deg; sigma 3: 1:4 0.6 deg but mound 13.1 deg). REJECTED: normals flip more than 90 deg under thin features near other mass: overhang 561 vertices, roof-2-high 141, slab 1 above ground 289, two walls 1 apart 120, hollow house 64. Ledge undersides render lit.
- **k-ring / smoothed-shadow normals on relaxed positions (ring2, ring3 = gn-wide, smooth4)**: Mean unit area normal over k rings, or area normals of a Laplacian-smoothed copy of the positions; edit zone only.
  - Result: No flips (worst deviation 25-44 deg). ring3: 1:4 1.7 deg, 1:8 5.8 deg, diagonal 2.3 deg. Needs apron 12-14 in edited regions (relaxed positions 2-4 steps further out), which also widens the dirty set.
- **gn-best normals: 3-ring on PRE-relaxation positions**: Same ring average over area normals of the guarded, capped starting offsets (d0); reach 7 blocks.
  - Result: No flips. High-frequency normal error 1:2 5.7 -> 0.5 deg, 1:4 6.4 -> 1.5, 1:8 5.1 -> 1.9, diagonal 6.5 -> 3.0, mound 5.4 -> 3.3, pit 6.4 -> 3.7. Harness rms 1:2 5.6 -> 0.7 deg, 1:4 10.6 -> 3.0, diagonal 8.1 -> 4.6, but mound 7.8 -> 9.3. Apron unchanged.
- **edit-zone scope details**: editReach 0-3; sharp blocks neither trigger the zone nor get ring normals.
  - Result: Reach does not change scene metrics. Without the sharp exclusion the ground beside a sharp brick wall tilted into a fillet; with it, sharp builds keep production normals.
- **gn-bevel: bevel geometry + gn shading**: Bevel positions, faceted flag off, gn-best AO, 3-ring normals on every vertex.
  - Result: Shading error 17-43 deg -> 0.1-9.4 deg; real-terrain AO roughness 0.068 -> 0.026. Terraced silhouettes and occlusion steps remain (images), and generated ground is worse than gn-best (hinted-hill 4.7 vs 0.8 deg, hinted slope 2.3 vs 0.0). Does not rescue bevel; needs apron about 7 instead of bevel's 3.

## Open questions

- Art sign-off on the quadratic AO onset. It keeps production's darkness at real concave edges and corners but thins contact shadows (0.93 vs 0.85 one block from a wall foot). The production linear curve (gn-ao) keeps the old falloff but leaves built-shape blotches (mound AO roughness 0.040 vs 0.019).
- Is apron 13 in edited regions (gn-wide: relaxed-position 3-ring, 1:4 ramp 1.7 deg, diagonal 2.3 deg) worth its larger regions and wider dirty set over gn-best's apron-neutral pre-relaxation ring (3.0 / 4.6 deg)?
- C-12: re-measure edit-to-swap p95 with about +3.3 ms per edited-chunk remesh in the real worker pool and browser; all timings here are Node on a loaded machine.
- Look in the real renderer (triplanar textures, fog, MSAA, the i7-1255U floor device); the study renderer uses flat palette colours.
- A crease-preserving ring weight could keep the build-to-ground junction crisp (mound rms back to 7.8 deg) without reintroducing lumps. The bilateral weights tried in reasoning conflict with terrace removal, so this needs its own study.
- The section 7.5 / M3 partition-invariance test should cover AO and normal bytes; work/gn/seams.mjs covers 3 chunk pairs with synthetic edits. Only 2 bench views and 16 timing chunks were inspected for AO artifacts in caves and cliffs.

## Harness issues reported

- bench.mjs writes out/<module name>/bench.json, so benching a baseline module for a same-load reference overwrites the shared baseline. I did this once to out/hints/bench.json (images untouched, run with --no-images), restored its exact previous content, and from then on used approaches/gn-ref-hints.mjs.
- Machine load from parallel teams makes bench.mjs's single-pass mean unreliable: the identical hints module measured 28.6, 35.0, 44.8 and 32.6 ms mean across runs. An interleaved min-of-N timer (work/gn/timing3.mjs) gave stable figures.
- run.mjs meshes every scene at one apron (10), and bench.mjs builds GEN_MESH regions without edits at the module's apron, where production would use 3. Apron-dependent costs and the 3-vs-10 seam case need separate tools (work/gn/timing3.mjs, work/gn/seams.mjs).
- The shading-normal metric mixes smooth bias with lumpiness: the 3-ring makes the mound visibly smooth yet scores worse (7.8 -> 9.3 deg rms). work/gn/hf.mjs adds a high-frequency normal error (error minus its neighbours' mean): production 5.4 deg vs gn-best 3.3 deg on the mound.
- AO roughness alone rewards AO = 1 everywhere (a dead zone scores 0.000 while killing overhang AO). work/gn/aocheck.mjs adds darkening checks: wall foot, inside corner, overhang, 1-high gap, tunnel floor, open flat.
- No thin-feature geometry scenes: the gradient normal that won every harness geometry scene flips under ledges and roofs. work/gn/flips.mjs adds a ledge over ground, slabs 1/2/3 above ground, a 1-thick house and two walls 1 apart.
- No seam test in the harness: work/gn/seams.mjs meshes adjacent chunk pairs through buildGenMeshInput (apron 3, 10 and mixed, with edits) and compares shared-vertex bytes. It caught a real bug in my ring code.

## Images (in the original run; not kept in this folder)

- out/gn-best/img/cmp-terrain-mountain.png
- out/gn-best/img/terrain-mountain-view.png
- out/gn-best/img/cmp-terrain-beach.png
- out/gn-best/img/cmp-mound.png
- out/gn-best/img/cmp-ramp-1-4.png
- out/gn-best/img/cmp-ao-inside-corner.png
- out/gn-grad/img/cmp-overhang-hints-grad-best.png
- out/gn-best/img/cmp-bevel-terrain-mountain.png
