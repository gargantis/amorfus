# Team gh: synthetic crossings (continue) (round 2)

Verdict: **strong**. Best variant: `gh-cc8b` (approaches/gh-cc8b.mjs).

## How it works

CPU-only change to the edited path of the hints mesher. It is a pre-pass that supplies synthetic crossings, followed by the existing mesher with k = 0. Code: work/gh/syn2.mjs contourCross6, which produces the same output as the plain reference contourCross5 on 116 crossing sets and 75,344 edges. Mesher: work/gh/mesher-gh.mjs, which takes a crossT input and a param clearance:'narrow'.

1. Crossings. Every sign-changing cell edge that touches a shape-edited block gets its crossing from the block data. The edge runs from solid s to air b along axis a, with face direction n. In the plane ⊥ a, the rule finds:
   - A: the nearest block one level lower in s's plane. This is an air block with solid behind it.
   - S: the nearest block one level higher in b's plane.
   The search uses Chebyshev rings up to R = 8 with Euclidean distances, and ties go to the first block in scan order. The crossing is t = eA/(eA+eS) with e = d − ½. Every crossing of a 1:k or k:1 staircase (k ≤ 8) therefore lies on the plane through its riser midpoints. Generated-only edges keep their hint crossings.

2. Round-2 repairs:
   - **cliffY.** On vertical edges, any air or solid block in the plane counts as A or S, so a level can drop by more than one block.
   - **cliffH.** On horizontal edges, the same applies, but only along the other horizontal axis within the edge's own layer. This is the plan outline's own cliffs. Wall tops and the ground do not count, so walls stay vertical.
   - **mirror.** When one side is missing, the rule searches along the mirror image of the found direction for the missing type. This repaired round 1's 53° toe facet on 1:1 stairs, which had trapped the player.
   - **Plateau rule.** When a side is still missing, a plateau rim rounds over w0 = 1.

3. Mesher.
   - No relaxation (k = 0): the vertex is the clamped mean of its crossings.
   - The thin-feature guard and sharp pinning are unchanged.
   - D-3 caps apply only where the intruded air is a narrow opening: an x/z air run of 1, or a y air run of 2 or less. Walls keep their vertical faces, so 2-block rises stay vertical without gs's tall-foot rule.

4. Unedited chunks take a byte-identical path (32/32 GEN_MESH meshes at aprons 3 and 10). Apron 10: R + 2.

5. For judging with gn AO, I ported gn-best's AO as a post-pass in work/gh/gnao.mjs. It is byte-identical to gn-best's AO bytes on 44 meshes and 66,692 vertices. approaches/gh-cc8b-gnao.mjs applies it.

Image panels: the h2h images are 2×2 grids — hints and gs-ctx on top, gs-mls and gh-cc8b below — all rendered with gn AO. The tower-top grid is hints and gs-mls on top, gh-cc8 (round 1) and gh-cc8b below.

## Comparison (harness compare.mjs)

| scene | cubes | hints | gh-cc8b | gs-mls | gh-cc8b-gnao |
|---|---|---|---|---|---|
| edge-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| edge-1:8 | 0.299 / 0.516 | 0.299 / 0.516 | 0.299 / 0.516 | 0.299 / 0.516 | 0.299 / 0.516 |
| edge-1:5 | 0.283 / 0.487 | 0.283 / 0.487 | 0.283 / 0.487 | 0.283 / 0.487 | 0.283 / 0.487 |
| edge-1:3 | 0.271 / 0.481 | 0.271 / 0.481 | 0.271 / 0.481 | 0.271 / 0.481 | 0.271 / 0.481 |
| edge-1:2 | 0.258 / 0.440 | 0.258 / 0.440 | 0.258 / 0.440 | 0.258 / 0.440 | 0.258 / 0.440 |
| edge-2:3 | 0.276 / 0.554 | 0.276 / 0.554 | 0.276 / 0.554 | 0.276 / 0.554 | 0.276 / 0.554 |
| edge-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.204 / 0.343 | 0.204 / 0.343 | 0.204 / 0.343 |
| disc-r2.4 | 0.286 / 0.619 | 0.286 / 0.619 | 0.286 / 0.619 | 0.286 / 0.619 | 0.286 / 0.619 |
| disc-r4.3 | 0.272 / 0.580 | 0.272 / 0.580 | 0.272 / 0.580 | 0.272 / 0.580 | 0.272 / 0.580 |
| disc-r7.6 | 0.297 / 0.679 | 0.297 / 0.679 | 0.297 / 0.679 | 0.297 / 0.679 | 0.297 / 0.679 |
| line1-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| line1-1:1 | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.204 / 0.343 CP |
| line1-1:2 | 0.258 / 0.440 CP | 0.258 / 0.440 CP | 0.258 / 0.440 CP | 0.258 / 0.440 CP | 0.258 / 0.440 CP |
| line2-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.204 / 0.343 | 0.204 / 0.343 | 0.204 / 0.343 |
| square-6 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| single | area ×1.00, 1 part | area ×1.00, 1 part | area ×1.00, 1 part | area ×1.00, 1 part | area ×1.00, 1 part |
| checker | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×1.00, 18 parts |
| junction3 | 0.296 / 0.661 | 0.296 / 0.661 | 0.296 / 0.661 | 0.296 / 0.661 | 0.296 / 0.661 |
| hill-materials | 0.292 / 0.627 | 0.330 / 0.696 | 0.330 / 0.696 | 0.330 / 0.696 | 0.330 / 0.696 |
| ramp-1:1 | 45.0° / 45.0° ao 0.108 | 0.1° / 0.5° ao 0.103 | 0.0° / 0.0° ao 0.108 | 0.5° / 1.6° ao 0.107 | 0.0° / 0.0° ao 0.000 |
| ramp-1:2 | 43.0° / 63.4° ao 0.075 | 5.6° / 8.7° ao 0.076 | 0.0° / 0.0° ao 0.072 | 0.4° / 1.6° ao 0.072 | 0.0° / 0.0° ao 0.000 |
| ramp-1:4 | 34.2° / 76.0° ao 0.041 | 10.6° / 19.6° ao 0.041 | 0.7° / 7.8° ao 0.041 | 0.9° / 1.9° ao 0.039 | 0.7° / 7.8° ao 0.000 |
| ramp-1:8 | 30.0° / 82.9° ao 0.043 | 11.5° / 26.5° ao 0.029 | 3.9° / 15.9° ao 0.043 | 6.7° / 9.3° ao 0.035 | 3.9° / 15.9° ao 0.005 |
| ramp-diag-1:2.8 | 46.7° / 76.4° ao 0.070 | 8.1° / 15.8° ao 0.074 | 0.9° / 1.4° ao 0.069 | 0.6° / 2.2° ao 0.077 | 0.9° / 1.4° ao 0.000 |
| mound-r6.4 | 48.4° / 83.5° ao 0.069 | 7.8° / 20.8° ao 0.075 | 6.9° / 17.5° ao 0.075 | 6.2° / 24.0° ao 0.075 | 6.9° / 17.5° ao 0.009 |
| pit-r5.4 | 48.3° / 81.5° ao 0.132 | 9.4° / 32.4° ao 0.146 | 7.2° / 18.5° ao 0.147 | 8.2° / 38.0° ao 0.146 | 7.2° / 18.5° ao 0.015 |
| terrace-disc | 0.291 / 0.728 | 0.219 / 0.486 | 0.194 / 0.452 | 0.149 / 0.358 | 0.194 / 0.452 |
| terrace-1:2 | 0.261 / 0.447 | 0.133 / 0.243 | 0.054 / 0.087 | 0.007 / 0.012 | 0.054 / 0.087 |
| tower-r4.6 | 0.341 / 0.616 | 0.170 / 0.338 | 0.194 / 0.456 | 0.158 / 0.379 | 0.194 / 0.456 |
| hinted-slope-1:4 | 34.2° / 76.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.000 |
| hinted-hill | 45.7° / 87.7° ao 0.061 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.000 |
| floating-block | ok 1.00 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 |
| pillar | ok 1.00 | ok 0.40 | ok 0.40 | ok 0.40 | ok 0.40 |
| tunnel-1x2 | ok 1.05 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 |
| roof-2-high | ok 2.00 | ok 1.90 | ok 1.95 | ok 1.92 | ok 1.95 |
| sharp-wall | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 |
| mesh ms (all scenes) | 859 | 996 | 913 | 1300 | 1067 |

## Real-terrain bench

```
gh-cc8b: 32.1 ms mean, 151.5 ms max per chunk (apron 10); 6099 triangles, 3326 vertices per chunk
```

## Seams

```
node harness/seams.mjs approaches/gh-cc8b.mjs
x-border: 67 shared vertices, 0 mismatched (apron 10)
z-border: 37 shared vertices, 0 mismatched (apron 10)
x-border, z=1: 56 shared vertices, 0 mismatched (apron 10)
(The same passes at apron 9, 8 and 6, so this test does not exercise R = 8 reach. My own test follows.)

node work/gh/seams-gh.mjs gh-cc8b 10 24
chunk 0,0: apron 10 vs 24: identical
chunk 1,0: apron 10 vs 24: identical
chunk 0,1: apron 10 vs 24: identical
chunk 1,1: apron 10 vs 24: identical
seam 0,0|1,0: 48 shared vertices, 0 mismatched
seam 0,0|0,1: 58 shared vertices, 0 mismatched
seam 1,0|1,1: 65 shared vertices, 0 mismatched
seam 0,1|1,1: 81 shared vertices, 0 mismatched
gh-cc8b: apron 10: 0 of 4 chunks differ from apron 24; seams 252 shared, 0 mismatched
(apron 9: 0 of 4 differ, 0 mismatched; apron 8: "gh-cc8b: apron 8: 1 of 4 chunks differ from apron 24; seams 252 shared, 3 mismatched", so the test is sensitive.)
gh-cc8b-gnao also passes harness/seams.mjs with 0 mismatched, AO bytes included.
```

## Timing

```
node harness/timing.mjs --n 11 approaches/hints.mjs approaches/gh-cc8b.mjs   (real terrain, no edits: byte-identical work)
hints            mesh only, min of 11: mean 10.30 ms, median 11.68 ms, max 16.75 ms (apron 10)
gh-cc8b          mesh only, min of 11: mean 10.61 ms, median 11.30 ms, max 16.45 ms (apron 10)

node work/gh/editbench2.mjs hints,gh-cc8b,gs-ctx,gs-mls --n 21   (REMESH inputs on seed 1,1 WITH edits, apron 10, interleaved)
mesh only, min of 21 interleaved runs (ms; generation excluded):
variant       mountain            single              town                corner×8 sum / max  
hints         16.21               6.25                9.19                55.6 / 11.93        (apron 10)
gh-cc8b       17.86               6.73                11.75               62.7 / 12.53        (apron 10)
gs-ctx        17.20               6.82                11.47               59.7 / 11.49        (apron 10)
gs-mls        24.74               6.70                31.82               71.5 / 13.22        (apron 10)
(Scenarios: mountain = 896 edited blocks (dug road, built mound, pit, cut terrace, wall); single = 1 placed block; town = 4,354 edits (levelled 28×28, 9 hollow houses, stairs); corner×8 = a house on a chunk corner, all 8 dirty chunks.)
Crossing pass alone (work/gh/prof3.mjs, min of 21): mountain 3.0 ms (821 edited edges), single 0.6, town 4.3 (2,995 edges), corner 1.2 max per chunk. Stress (work/gh/worst2.mjs): random rubble with 26,225 edited edges, crossings 18–21 ms.
Apron-16 combinations, separate run (min of 11; hints in that run 24.99 / 7.51 / 10.58 / 57.3 / 11.36): gh-ccj6 40.11 / 15.77 / 29.62 / 157.6 / 32.49; gh-ccmls 53.60 / 15.69 / 49.42 / 176.2 / 31.61.
```

## What it fixes

- Built slopes become planes, as smooth as generated ones. Shading rms / max: 1:1 0.0° (hints 0.1°), 1:2 0.0°/0.0° (5.6°/8.7°), 1:4 0.7°/7.8° (10.6°/19.6°), 1:8 3.9°/15.9° (11.5°/26.5°; gs-mls 6.7°), diagonal 0.9°/1.4° (8.1°/15.8°). Interior normals of the 1:8 ramp are exactly atan(1/8) = 7.1° (work/gh/dbg-nrm.mjs).
- Curved builds with lower crease maxima than either rival: mound 6.9°/17.5° (hints 7.8°/20.8°, gs-mls 6.2°/24.0°) and pit 7.2°/18.5° (9.4°/32.4°, gs-mls 8.2°/38.0°).
- Built outlines: terrace-1:2 0.133→0.054 and terrace-disc 0.219→0.194.
- Tower regression explained and partly repaired: 0.226→0.194 (hints 0.170, gs-mls 0.158). The cause was a horizontal-edge contour search that found a 1-level site on the far side of the tower (8 blocks across) while the near side was an empty column, which pushed concave plan corners out by up to +0.45. The cliffH rule fixes that. What remains is outline smoothing, which k = 0 does not do: every rule shows −0.40 to −0.49 at the 90° extreme run, a rasterisation limit. See out/gh-cc8b-gnao/h2h/tower-top-hints-gsmls-ghcc8-ghcc8b.png.
- Round 1's 1:1-staircase toe defect is repaired: a 53° facet that stopped the real controller is now 18.4° then 45°.
- Isolated 1-high steps stay crisp: a rounded step 1.88 blocks wide (10–90%), 37° max, top exactly 7.000. Hints gives 1.31 / 44° but floats +0.05; gs-ctx 2.81 / 21°; gs-mls 3.06 / 17° and overshoots +0.035. Images: out/gh-cc8b-gnao/h2h/step1-side.png.
- Placed floors sit exactly on their planes with no moat. On ground hinted 0.45 above the grid, the floor top is 7.000, the ground stays at 6.449, and the floor edge is 1.69 blocks (10–90%). Hints floats the floor +0.051 and digs a 0.40-deep moat around it (6.05). The player stands at 9.000 where hints gives 9.051, so hints fails that battery check. See out/gh-cc8b-gnao/h2h/floor45.png.
- Physics with the real §9.3 controller and collision, bundled read-only from the repo (work/gh/phys): 36 of 36 PLAN-derived checks pass. They cover:
- built 1-block rises (binary ground, hinted ground at phases 0, 0.25 and 0.45, and a diagonal approach);
- 2-block rises blocked (binary, hinted ×3 while sprinting, diagonal, a staircase-outline wall, one step then a 2-high riser), with no tall-foot rule needed because walls stay vertical;
- a one-layer pit you can walk out of and a two-layer pit you cannot;
- a sharp wall that a jump clears;
- D-3 gates: a 1×2 tunnel in binary rock and in hinted rock at 2 phases, a roof 2 above hinted ground at phases 0, 0.2 and 0.45, 1-wide gaps (placed|natural and placed|placed), a doorway, and a diagonal dug corridor;
- built 1:1, 1:2, 1:4 and 1:8 staircases walkable, with zero idle drift at 4 spots each;
- zero drift on a diagonal ramp;
- placed floors.
- Combined with gn-best's AO, block-shaped AO bands vanish on built shapes. AO roughness: ramp-1:4 0.000, 1:8 0.005, mound 0.009, pit 0.015, against 0.016–0.081 for gn-best on hints geometry.
- Unedited chunks are byte-identical to the repo mesher (32 meshes), so generator goldens and the 38³ GEN_MESH path stand. The edit path costs +0.5 to +2.6 ms per edited chunk; gs-mls costs up to +22.6 ms.

## What it does not fix

- Material boundaries, the owner's main point. Every material scene is identical to hints: staircases at std 0.20–0.30, and the 1-wide diagonal pinches (CP). This approach moves only edited geometry.
- Generated terrain is byte-identical to hints. Its material stair-steps remain, and so do its AO stripes unless gn's AO is added.
- Plan outlines of curved builds are still not as round as gs-mls: tower 0.194 against 0.158, terrace-disc 0.194 against 0.149, terrace-1:2 0.054 against 0.007. Within apron 10 there is no reach left for outline smoothing.
- The ends of gentle built ramps are still steeper (1:8 max 15.9°). Generated ground in front of a built ramp keeps its hint crossings, so the toe starts late. The top plateau rounds over w0 = 1 instead of half a tread.
- Side scallops: a sloped build bounded by a cliff (ramp sides, the walls of the diagonal ramp, stair sides) shows tread-period waves within about 6 blocks of the side. Normals vary 3–17° against the true 7.1° on the 1:8 ramp at z = 24–26. The 2D nearest-contour search mixes the side cliff with the front contour. gs-mls shows the same scallops. See out/gh-cc8b-gnao/h2h/ramp-1:4-hints-gsctx-gsmls-ghcc8b.png, near edge.
- With k = 0, domes and bowls are piecewise planar. Mounds and pits show flat facets at close range, while gs-mls looks smoother (out/gh-cc8b-gnao/h2h/mound-r6.4-hints-gsctx-gsmls-ghcc8b.png). gn-style 3-ring normals hide the facets but need apron 13 and raise the shading rms (mound 8.1°).
- 1-wide diagonal built ridges stay wavy, and the 'skirt' at tower and mound bases remains. The skirt is common to every rule.

## Failure modes

- Contour misreading: any terracing reads as a slope. A 1-high platform with a 2-high building within 8 blocks gets its rim interpolated toward the building's contour, so the rim drops up to about 0.4 instead of the plateau rule's 0.25. Architecture that should stay crisp needs the sharp bit.
- R = 8 is a hard cutoff. Slopes gentler than 1:8 fall back to plateau rounding (terraces return), and behaviour changes abruptly when a contour moves from 8 to 9 blocks away.
- cliffY rounds the top rim of every wall 2 or more high by 0.25. This is consistent with 1-high rims, but it softens built walls.
- Sprint-jumping onto a built 2-block rise works under every smooth rule, production hints included (hints y 10.90, gh-cc8b 10.90, gs-mls 10.02 on binary ground). Pure cubes block it. The cause is the rounded rim plus the 1.27 jump apex and the 0.6 step-up. This was an extra battery check, not a PLAN invariant; the results are in work/gh/phys/battery-final.txt.
- Worst-case cost: random rubble with 26k edited edges per chunk adds 18–21 ms of crossing work. That is a C-12 risk if a corner edit dirties 8 such chunks; typical edits add 0.5–4.3 ms.
- Prototype overheads: the crossing pass builds its own solid array and per-plane summed-area tables lazily (81–92 per edited chunk). In production it should share the mesher's pass-1 arrays.
- Combinations with gs's relaxation or MLS on top of my crossings need apron 16, because the reach adds up (9 for crossings plus the window or k). They cost 2.5–3× hints on the edit path and push pit maxima to 33–40°.

## Production fit

- **dataPath**: CPU only, in the mesh worker for GEN_MESH and REMESH of chunks that have a shape edit within reach. A crossing pass computes one f32 crossing per sign-changing edge that touches an edited block (work/gh/syn2.mjs contourCross6), and pass 1 of the mesher uses it in place of ρ interpolation (work/gh/src/core/mesh/mesher.ts, crossT hook). Pass 3 (Jacobi) is skipped for R (k = 0). D-3 caps are tested for a narrow opening per axis and side (narrowAt). Nothing new reaches the GPU: no per-quad buffers, textures or attributes.
- **vertexFormat**: Unchanged 16-byte vertex. None of the 3 reserved bytes is used, and vertex and triangle counts are unchanged because the topology is untouched (bench: 6,099 triangles and 3,326 vertices per chunk, the same as hints). If combined with gn-best, only the existing AO byte changes.
- **determinism**: The crossing uses only + − × ÷ √, comparisons, and Math.round of exact integer ratios (the mirror-ray steps), with a fixed ring-scan order that also fixes tie-breaking. The summed-area tables are integer. Crossings are stored as f32 and quantised to 1/256 as today.
Verified:
- contourCross6 equals the plain contourCross5 on 116 crossing sets.
- Unedited chunks are byte-identical to the repo mesher (32 meshes, aprons 3 and 10).
- The patched mesher bundles are byte-identical to the originals without crossT (same.mjs, same-ghgs.mjs: 144 meshes).
Edited-region goldens change; they may be re-emitted until D-24.
- **apron**: 10, unchanged. A crossing at corner c reads blocks within [c−9, c+8] (in-plane search R = 8 from the edge's blocks, plus the A/S predicate's neighbour along the edge axis). Normals add 1, so the chunk needs blocks [−10, 41], which matches the 52³ region and PLAN's dirty rule [b−9, b+10], with k = 6. The dirty set stays at most 8 chunks. The unedited path stays at 38³.
Verified by work/gh/seams-gh.mjs: apron 10 and 9 are byte-identical to apron 24 on 4 chunks, with 252 seam vertices and 0 mismatches. Apron 8 fails (1 chunk, 3 mismatches).
- **cpuCost**: Floor-class CPU (this machine is the i7-1255U), interleaved min-of-21 (work/gh/editbench2.mjs), generation excluded:
- mountain chunk with 896 edits: 16.21 → 17.86 ms
- single placed block: 6.25 → 6.73
- dense town (4,354 edits): 9.19 → 11.75
- 8-chunk corner edit: max per chunk 11.93 → 12.53 (sum 55.6 → 62.7)
The crossing pass alone takes 0.4–4.3 ms, and skipping relaxation saves about 1 ms. Worst-case rubble adds 18–21 ms.
Unedited real terrain: no change (timing.mjs: 10.61 vs 10.30 ms mean on byte-identical work).
For comparison, gs-mls costs 24.74 ms on the mountain and 31.82 on the town.
- **gpuCost**: None: no shader change, same vertex and triangle counts. gn AO, if adopted, is also zero-cost on the GPU.
- **physics**: Real controller (repo controller.ts and collision.ts bundled read-only) against gh-cc8b meshes served per chunk at apron 10: 36 of 36 PLAN-derived checks pass; full list under fixes, results in work/gh/phys/battery-final.txt. 2-block rises stay blocked without gs's tall-foot rule because riser faces stay vertical. The extra sprint-jump check fails under every smooth rule, hints included.
- **editability**: Picking is unchanged: vertices stay in their cells and quads still map to block pairs.
- Guard holds: pillar 0.40, floating block 0.60, tunnel 1.00 × 1.90, roof gap 1.95.
- Sharp faces stay pinned (0 off-plane).
- Placed blocks sit exactly on their planes: no float and no moat.
- A placed 1-high step reads as a step 1.9 blocks wide. The plateau width w0 is the crispness knob (0.5 / 1 / 2 gives 1.38 / 1.88 / 2.50 blocks); crisp architecture still needs the sharp bit.

## Combines with

Question (5), measured with the gs mesher copy patched to accept my crossings (work/gh/patch-gs.mjs → mesher-ghgs.mjs, byte-identical to the original gs mesher without crossT):

- **Best within the production apron (10):** my crossings with k = 0, plus either set of caps. At k = 0, gs's context caps and my narrow caps give identical results on ramps, terraces and the tower, and both pass physics. Narrow caps are simpler: no tall-foot rule is needed because walls stay vertical. gs's midpoint crossings at edited edges are subsumed: my rule gives ½ wherever no contour is in reach, and it also fixes the floating-floor defect.
- **gs's windowed quadric fit or k = 6 Jacobi on top of my crossings (gh-ccmls, gh-ccj6):** the round shapes improve (tower 0.152/0.162, 1:8 2.1°/2.2°), but the apron must grow to 16. That makes generation and meshing 2.5–3× the hints edit-path cost, and pit maxima rise to 33–40°. I do not recommend it.

Stacks with:
- **gn-best AO, recommended.** Ported byte-identical; AO roughness on built shapes drops to 0.000–0.015.
- **gn edit-zone normals, optional.** These hide dome facets but need apron 13.
- **Any material-boundary approach** (mf-iso, mx-contour, generator material hints), because quads, materials and the vertex format are untouched.

Not with the bevel rule, which replaces the same positions.

Head-to-head with gs: gs-mls wins on plan outlines and dome smoothness. gh-cc8b wins on gentle ramps (1:8 3.9° vs 6.7°), crease maxima (pit 18.5° vs 38.0°), step crispness (1.9 vs 3.1 blocks) and edit cost (+0.5 to +2.6 ms vs up to +22.6 ms).

## Variants tried

- **gh-cc8 (round 1)**: A/S-site contour crossings (R 8, w0 1), k 0, narrow caps
  - Result: Ramps 1:1/1:2 0.0°, 1:4 0.7°, 1:8 3.8°, diag 0.9°, mound 7.3°, pit 7.5°, but tower 0.226. The real-controller battery found a defect: the 1:1 staircase toe had a 53.1° facet and the player was stuck at x 6.32 (35/36).
- **cc-mirror**: + mirror-ray search for the missing side
  - Result: The toe becomes 18.4° then a clean 45° plane, and the 1:1 staircase is walkable (36/36). Tower 0.212, terrace-disc 0.194.
- **cc-cliffH-m**: + same-layer cliffs for horizontal edges
  - Result: Tower 0.226→0.194. The cause was a horizontal-edge search that found a 1-level site across the tower, 8 blocks away, while the near side was an empty column; that pushed concave corners out by up to +0.45. Terrace-disc 0.194, mound 7.0°, pit 7.4°.
- **gh-cc8b (best) = + cliffY**: vertical edges also treat any air/solid as a contour
  - Result: Mound 6.9°/17.5°, pit 7.2°/18.5°; ramps unchanged. Rims of tall walls now round by 0.25, like 1-high rims. Physics 36/36, seams exact at apron 10.
- **dome rule / w0 0.5, 2**: curvature-aware plateau and plateau-width sweep
  - Result: The dome rule does not help (tower 0.245–0.263). w0 is the crispness knob: step 10–90% width 1.38 / 1.88 / 2.50 blocks for w0 0.5 / 1 / 2. 1:8 gives 5.0° / 3.9° / 3.1° and tower 0.225 / 0.194 / 0.187. w0 = 1 kept.
- **pair / cone (side scallops)**: re-pair A and S on opposite sides; the unpaired nearer site only rounds
  - Result: Metrics unchanged. With a 0.85 cone, rows 4 blocks from a ramp side become exact, but rows 1–2 from the side become stepped rims instead of scallops. Not adopted.
- **ccC (crossings + gs context caps, k 0)**: gs capMode 'context' instead of narrow caps
  - Result: Identical on ramps, terraces and tower. Mound/pit slightly worse (7.3°/8.3° vs 7.0°/7.4° without cliffY). Physics passes. At k = 0 the caps rarely bind.
- **light relaxation in budget**: R7 k1 (apron 10), R6 k2 (apron 10), R8 k2 (apron 12)
  - Result: Terrace 0.184–0.191, tower 0.188–0.191: little gain. R < 8 loses 1:8 (4.8–6.5°), and the mound and pit crease maxima reach about 30°.
- **gh-ccj6 (crossings + gs-ctx k 6, apron 16)**: my crossings as d₀, context caps, R dilated 1, k = 6
  - Result: Tower 0.162, terrace-disc 0.176, 1:8 2.2°, but pit 9.2°/40.3°. Edit path 40.1 ms mountain (hints 25.0), corner×8 max 32.5 ms (11.4): too expensive.
- **gh-ccmls (crossings + gs-mls, apron 16)**: my crossings as d₀ + gs windowed quadric fit + 1 Jacobi step
  - Result: Tower 0.152, 1:8 2.1°, mound 6.4°/23.7°, terrace-disc 0.185. Edit path 53.6 ms mountain, 49.4 town (hints 10.6), corner×8 max 31.6 ms, plus generation at 62³: about 2.5–3× hints. Seam-exact at 16.
- **gh-cc8b-gnao**: + gn-best AO (box at the actual position over partial volume)
  - Result: AO roughness: ramp-1:4 0.041→0.000, 1:8 0.043→0.005, diag 0.069→0.000, mound 0.075→0.009, pit 0.147→0.015. AO bands on built shapes are gone.
- **gh-cc8b-ring (study)**: + gn-style 3-ring edit-zone shading normals
  - Result: Hides dome facets visually (work/gh/img2/mound-ring2.png), but shading rms gets worse (mound 8.1°, pit 10.2°, 1:4 1.1°) and production needs apron 13. Not adopted.
- **narrow-bits precompute**: per-air-block narrowness bits for the cap test
  - Result: Byte-identical (153 meshes) and no speed gain in an interleaved A/B. Reverted.

## Open questions

- Look sign-off: does the owner accept piecewise-planar domes and bowls (k = 0) in exchange for exact ramps, crisp steps and low crease angles? If not, the next step is gn-style edit-zone normals with apron 13, or R = 6 with 2-ring normals inside apron 10, which loses exact 1:8 ramps.
- The crispness knob: plateau width w0 = 1 gives 1.9-block steps. Should placed curbs and floors be crisper (w0 = 0.5: 1.4 blocks, 45°) at some cost on 1:8 ramps (5.0°)?
- Side scallops on sloped builds next to cliffs remain unsolved. A contour-orientation test that tells transverse cliffs from slope contours is needed; gradient pairing with cones fixed rows 4 blocks in but not the rim rows.
- Ramp toes: should the crossing override extend to generated ground edges within 1 block of a build? That would let built ramps meet the ground smoothly, but natural ground beside builds would lose hint precision, and the reach grows by 1 (apron 11, or R = 7).
- Is sprint-jumping onto a 2-block rise acceptable? It happens under every smooth rule, production included (cubes block it). If not, it is a controller or rim-rounding question, not one specific to this rule.
- Edit latency for very dense builds: crossings are 18–21 ms on a pathological rubble chunk. Fusing the crossing pass into the mesher's pass 1 and sharing its arrays should be measured in the real worker pool against C-12.

## Harness issues reported

- harness/seams.mjs is not sensitive to long-reach rules: it passes gh-cc8b at apron 6, even though the rule needs 10, because its built shapes are small and no long contour search crosses a border. My work/gh/seams-gh.mjs compares bytes at apron A against apron 24 on 4 chunks, plus 252 seam vertices. It catches apron 8 (1 chunk differs, 3 mismatches) and passes 9 and 10.
- Timing noise is large. The same byte-identical hints work measured 16.1–25.0 ms on the mountain chunk in different runs, and non-interleaved A/B runs swung by 1.5–2×; one run showed the gh mesher +13 ms on rubble, which an interleaved A/B put at +2 ms. Only interleaved min-of-N within one process is usable. The bench line, 32.1 ms against 28.6 for hints in the same session, is noise on byte-identical unedited work.
- The ramp metric window (z 8–24, x 6.5–25.5) excludes most of the side-cliff band and the creases at toe and top, so side scallops, which are clearly visible in views, barely register.
- compare.mjs 'mesh ms' compares folders timed at different moments (known); it should not be used for cost.
- The README's thin-line rescoring changed hints, cubes and gh-cc8 rows (line1-1:2 0.287 → 0.258), but older results.json files from other teams were not all rescored, so line1 rows differ between columns.

## Images (in the original run; not kept in this folder)

- out/gh-cc8b-gnao/h2h/ramp-1:4-hints-gsctx-gsmls-ghcc8b.png
- out/gh-cc8b-gnao/h2h/mound-r6.4-hints-gsctx-gsmls-ghcc8b.png
- out/gh-cc8b-gnao/h2h/step1-side.png
- out/gh-cc8b-gnao/h2h/floor45.png
- out/gh-cc8b-gnao/h2h/gallery-hints-gsctx-gsmls-ghcc8b.png
- out/gh-cc8b-gnao/h2h/edit-mountain-overview.png
- out/gh-cc8b-gnao/h2h/edit-town-houses.png
- out/gh-cc8b-gnao/h2h/tower-top-hints-gsmls-ghcc8-ghcc8b.png
