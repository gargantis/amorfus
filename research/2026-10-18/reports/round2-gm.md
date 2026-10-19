# Team gm: generator material hints (new) (round 2)

Verdict: **strong**. Best variant: `gm-hint` (approaches/gm-hint.mjs).

## How it works

Generator MATERIAL HINTS: the continuous fields behind the generated materials go into each vertex, the way rho already does for shape.

What I read: src/core/gen/v1/index.ts (lines 230–249), PLAN §6.4, §7.1–7.5 and §9.1, src/core/mesh/assemble.ts and gen-mesh.ts, goldens-emit.test.ts, and the study README, work-phaseA.json and mf's fast.mjs. Everything below the evidence lines is measured unless marked 'est.'.

1. The v1 rule, verified in the code. solid ⇔ d > 0. top if dTerrain ≤ 1 (SAND if H ≤ SEA_LEVEL + 2, else GRASS); DIRT if dTerrain ≤ 4; STONE beyond. Here dTerrain = H − y + 8·fbm3d where |H − y| < 24; the cave term enters d only, never dTerrain. So two fields decide every generated material:
   - S = SEA + 2 − H, per COLUMN;
   - D = dTerrain, per BLOCK.
   Both are values the generator already computes.
   The copy is work/gm/gen-gm.mjs. It emits two planes in the same loop: sQ (Int16, S·256) and dQ (Int8, D·16). Against lib/gen-mesh.mjs, 0 of 4,105,080 cells differ in blocks, rho or shapeEdited. The rule recomputed from (S, D) reproduces all 2,669,469 solid blocks (work/gm/check-gen.mjs).
   Note: the generator samples block b at its integer corner, while the mesher treats that sample as the block centre. The rendered world therefore sits ½ block off the continuous field. gm interpolates with the mesher's convention, so material contours stay consistent with the rendered shape.

2. Per vertex: S bilinear from the 4 column centres, and E = max(0, D) trilinear from the 8 block centres, both at the vertex's quantised position. They are stored as two 12-bit codes in the 3 reserved bytes; flags bit 3 = gen mode. The fragment applies the v1 thresholds to the interpolated values: E ≤ 1 → (S ≥ 0 ? sand : grass); E ≤ 4 → dirt; else stone. 12-bit codes measure the same as float on every metric, and the Int8 D plane the same as Int16.
   On the natural surface D ≈ 0: vertices sit 0.035 std (p99 0.21) off the D = 0 set. So the literal rule renders a continuous top skin. The sand/grass boundary is exactly the H = 2 contour, and caves, cave mouths and digs show top/dirt/stone as smooth D contours. Today's dirt specks and stripes are block-centre sampling of a vertical depth rule (a riser exposes the 2nd block of a column), so they do not appear.

3. Player edits. A quad is in FALLBACK mode if:
   - its own block is edited or sharp; or
   - a corner sees a non-sharp edited solid surface block within the mf-iso window (±3).
   There it gets mf-iso's field (σ 1.2, τ 0.55 guard, flips and fans, 6 × 5-bit), except that GENERATED surface blocks count as background mass. That mass carries the gen field's soft weights: piecewise-linear ramps 1.5 blocks wide in space (E scaled by its local gradient), forming a partition of unity over grass, sand, dirt and stone.
   Effects:
   - an edit gets no halo of staircase materials;
   - at the zone border both modes show the same contour: 0.10 % of border-edge length mismatched;
   - vertices shared by both modes are duplicated, so every triangle is single-mode.
   Without planes (synthetic scenes) the module is mf-iso exactly.

4. Harness plumbing: harness GEN_MESH inputs carry no seed, origin or planes. work/gm/shim.mjs recognises the bench chunks by content and attaches the extended generator's planes for exactly that region, after verifying the blocks are identical. All real-terrain numbers below come from work/gm tools that build the extended input explicitly.

Real-terrain metrics, 16 bench chunks, same input for all (work/gm/terrain-metrics.mjs):

| metric | hints | mf-iso | gm-hint | gm-slope |
|---|---|---|---|---|
| shore vs exact H = 2: std / max / mean | 0.329 / 0.818 / 0.058 | 0.145 / 0.520 / 0.182 | 0.019 / 0.061 / 0.004 | 0.019 / 0.061 / 0.004 |
| shore high-pass std | 0.176 | 0.046 | 0.014 | 0.014 |
| parabola-fit wiggle, all pairs | 0.276 | 0.250 | 0.032 | 0.045 |
| wiggle, grass\|sand | 0.172 | 0.033 | 0.014 | 0.014 |
| dirt share of the top surface | 6.65 % | 5.46 % | 0.27 % (cave mouths only) | 5.20 % |

Images:
- sheet-terrain.png: columns hints | mf-iso | gm-hint | gm-slope; rows mountain close, beach close, valley chunk (2,1,6), terraced chunk (6,0,−9).
- plan-final.png: same columns, plan views.
- shore-exact.png: hints | mf-iso | gm-hint, with the exact contour drawn in black.
- sheet-edits-*.png: hints | mf-iso | gm-hint, plan view on top and 3-D below.

## Comparison (harness compare.mjs)

| scene | cubes | hints | gm-hint | mf-iso | gm-slope |
|---|---|---|---|---|---|
| edge-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| edge-1:8 | 0.299 / 0.516 | 0.299 / 0.516 | 0.131 / 0.220 | 0.131 / 0.220 | 0.131 / 0.220 |
| edge-1:5 | 0.283 / 0.487 | 0.283 / 0.487 | 0.054 / 0.101 | 0.054 / 0.101 | 0.054 / 0.101 |
| edge-1:3 | 0.271 / 0.481 | 0.271 / 0.481 | 0.007 / 0.010 | 0.007 / 0.010 | 0.007 / 0.010 |
| edge-1:2 | 0.258 / 0.440 | 0.258 / 0.440 | 0.006 / 0.007 | 0.006 / 0.007 | 0.006 / 0.007 |
| edge-2:3 | 0.276 / 0.554 | 0.276 / 0.554 | 0.021 / 0.044 | 0.021 / 0.044 | 0.021 / 0.044 |
| edge-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| disc-r2.4 | 0.286 / 0.619 | 0.286 / 0.619 | 0.130 / 0.266 | 0.130 / 0.266 | 0.130 / 0.266 |
| disc-r4.3 | 0.272 / 0.580 | 0.272 / 0.580 | 0.129 / 0.302 | 0.129 / 0.302 | 0.129 / 0.302 |
| disc-r7.6 | 0.297 / 0.679 | 0.297 / 0.679 | 0.148 / 0.364 | 0.148 / 0.364 | 0.148 / 0.364 |
| line1-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.009 / 0.028 | 0.009 / 0.028 | 0.009 / 0.028 |
| line1-1:1 | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.000 / 0.000 A | 0.000 / 0.000 A | 0.000 / 0.000 A |
| line1-1:2 | 0.258 / 0.440 CP | 0.258 / 0.440 CP | 0.043 / 0.117 | 0.043 / 0.117 | 0.043 / 0.117 |
| line2-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| square-6 | 0.000 / 0.000 | 0.000 / 0.000 | 0.192 / 0.468 | 0.192 / 0.468 | 0.192 / 0.468 |
| single | area ×1.00, 1 part | area ×1.00, 1 part | area ×0.56, 1 part A | area ×0.56, 1 part A | area ×0.56, 1 part A |
| checker | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×1.33, 1 part A | area ×1.33, 1 part A | area ×1.33, 1 part A |
| junction3 | 0.296 / 0.661 | 0.296 / 0.661 | 0.085 / 0.152 | 0.085 / 0.152 | 0.085 / 0.152 |
| hill-materials | 0.292 / 0.627 | 0.330 / 0.696 | 0.142 / 0.350 | 0.142 / 0.350 | 0.142 / 0.350 |
| ramp-1:1 | 45.0° / 45.0° ao 0.108 | 0.1° / 0.5° ao 0.103 | 0.1° / 0.5° ao 0.103 | 0.1° / 0.5° ao 0.103 | 0.1° / 0.5° ao 0.103 |
| ramp-1:2 | 43.0° / 63.4° ao 0.075 | 5.6° / 8.7° ao 0.076 | 5.6° / 8.7° ao 0.076 | 5.6° / 8.7° ao 0.076 | 5.6° / 8.7° ao 0.076 |
| ramp-1:4 | 34.2° / 76.0° ao 0.041 | 10.6° / 19.6° ao 0.041 | 10.6° / 19.6° ao 0.041 | 10.6° / 19.6° ao 0.041 | 10.6° / 19.6° ao 0.041 |
| ramp-1:8 | 30.0° / 82.9° ao 0.043 | 11.5° / 26.5° ao 0.029 | 11.5° / 26.5° ao 0.029 | 11.5° / 26.5° ao 0.029 | 11.5° / 26.5° ao 0.029 |
| ramp-diag-1:2.8 | 46.7° / 76.4° ao 0.070 | 8.1° / 15.8° ao 0.074 | 8.1° / 15.8° ao 0.074 | 8.1° / 15.8° ao 0.074 | 8.1° / 15.8° ao 0.074 |
| mound-r6.4 | 48.4° / 83.5° ao 0.069 | 7.8° / 20.8° ao 0.075 | 7.8° / 20.8° ao 0.075 | 7.8° / 20.8° ao 0.075 | 7.8° / 20.8° ao 0.075 |
| pit-r5.4 | 48.3° / 81.5° ao 0.132 | 9.4° / 32.4° ao 0.146 | 9.4° / 32.4° ao 0.146 | 9.4° / 32.4° ao 0.146 | 9.4° / 32.4° ao 0.146 |
| terrace-disc | 0.291 / 0.728 | 0.219 / 0.486 | 0.218 / 0.485 | 0.218 / 0.485 | 0.218 / 0.485 |
| terrace-1:2 | 0.261 / 0.447 | 0.133 / 0.243 | 0.133 / 0.243 | 0.133 / 0.243 | 0.133 / 0.243 |
| tower-r4.6 | 0.341 / 0.616 | 0.170 / 0.338 | 0.170 / 0.338 | 0.170 / 0.338 | 0.170 / 0.338 |
| hinted-slope-1:4 | 34.2° / 76.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 |
| hinted-hill | 45.7° / 87.7° ao 0.061 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 |
| floating-block | ok 1.00 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 |
| pillar | ok 1.00 | ok 0.40 | ok 0.40 | ok 0.40 | ok 0.40 |
| tunnel-1x2 | ok 1.05 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 |
| roof-2-high | ok 2.00 | ok 1.90 | ok 1.90 | ok 1.90 | ok 1.90 |
| sharp-wall | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 |
| mesh ms (all scenes) | 859 | 996 | 892 | 863 | 975 |

Rows that do not apply: none of the synthetic scenes carry generator fields. Every MATERIAL row for gm-hint and gm-slope therefore equals mf-iso by construction: the module is mf-iso exactly when no planes are present. The geometry and constraint rows equal hints, because gm does not touch geometry. The evidence for gm is the real-terrain table in howItWorks.

## Real-terrain bench

```
gm-hint: 20.2 ms mean, 84.2 ms max per chunk (apron 6); 6099 triangles, 3326 vertices per chunk
```

## Seams

```
Generator-based seam test, node work/gm/seams-gen.mjs approaches/gm-hint.mjs. Real world, seed 1,1, extended GEN_MESH input. Vertices are keyed by lattice corner + material + sharp + mode. Each record compares position, normal, AO and all 9 attributes.

no edits, -1,1,1|0,1,1: 63 shared (63 gen-mode), 0 mismatched (aprons 3/3)
no edits, -1,1,1|-1,1,2: 161 shared (161 gen-mode), 0 mismatched (aprons 3/3)
no edits, 0,0,-3|1,0,-3: 0 shared (0 gen-mode), 0 mismatched (aprons 3/3)
no edits, 0,0,-3|0,0,-2: 44 shared (44 gen-mode), 0 mismatched (aprons 3/3)
no edits, -2,1,1|-2,2,1: 17 shared (17 gen-mode), 0 mismatched (aprons 3/3)
no edits, 0,0,0|0,1,0: 58 shared (58 gen-mode), 0 mismatched (aprons 3/3)
no edits, -3,1,0|-2,1,0: 137 shared (137 gen-mode), 0 mismatched (aprons 3/3)
no edits, 1,0,0|1,0,1: 24 shared (24 gen-mode), 0 mismatched (aprons 3/3)
no edits, -1,1,1|0,1,1: 63 shared (63 gen-mode), 0 mismatched (aprons 6/6)
no edits, -1,1,1|-1,1,2: 161 shared (161 gen-mode), 0 mismatched (aprons 6/6)
no edits, 0,0,-3|1,0,-3: 0 shared (0 gen-mode), 0 mismatched (aprons 6/6)
no edits, 0,0,-3|0,0,-2: 44 shared (44 gen-mode), 0 mismatched (aprons 6/6)
no edits, -2,1,1|-2,2,1: 17 shared (17 gen-mode), 0 mismatched (aprons 6/6)
no edits, 0,0,0|0,1,0: 58 shared (58 gen-mode), 0 mismatched (aprons 6/6)
no edits, -3,1,0|-2,1,0: 137 shared (137 gen-mode), 0 mismatched (aprons 6/6)
no edits, 1,0,0|1,0,1: 24 shared (24 gen-mode), 0 mismatched (aprons 6/6)
no edits, -1,1,1|0,1,1: 63 shared (63 gen-mode), 0 mismatched (aprons 10/10)
no edits, -1,1,1|-1,1,2: 161 shared (161 gen-mode), 0 mismatched (aprons 10/10)
no edits, 0,0,-3|1,0,-3: 0 shared (0 gen-mode), 0 mismatched (aprons 10/10)
no edits, 0,0,-3|0,0,-2: 44 shared (44 gen-mode), 0 mismatched (aprons 10/10)
no edits, -2,1,1|-2,2,1: 17 shared (17 gen-mode), 0 mismatched (aprons 10/10)
no edits, 0,0,0|0,1,0: 58 shared (58 gen-mode), 0 mismatched (aprons 10/10)
no edits, -3,1,0|-2,1,0: 137 shared (137 gen-mode), 0 mismatched (aprons 10/10)
no edits, 1,0,0|1,0,1: 24 shared (24 gen-mode), 0 mismatched (aprons 10/10)
edits across x=0 (paint + planks): 45 shared (14 gen-mode), 0 mismatched (aprons 10/10)
edits across z=64 (pit + brick line): 155 shared (137 gen-mode), 0 mismatched (aprons 10/10)
mixed aprons (edit 20 blocks inside B): 45 shared (45 gen-mode), 0 mismatched (aprons 3/10)
all shared vertices identical

Harness, node harness/seams.mjs approaches/gm-hint.mjs --apron 10 (synthetic world, so the mf-iso fallback path):
x-border: 67 shared vertices, 0 mismatched (apron 10)
z-border: 37 shared vertices, 0 mismatched (apron 10)
x-border, z=1: 56 shared vertices, 0 mismatched (apron 10)

At the module's default apron 6, harness seams.mjs reports 3 NORMAL mismatches on 'x-border, z=1'. The gm attributes are identical. hints.mjs and mf-iso show the same 3 mismatches at apron 6, because the mesher needs apron 10 near shape edits; production already uses 52³ there. gm-slope passes the same generator seam test: all shared vertices identical.
```

## Timing

```
node harness/timing.mjs --n 11 approaches/hints.mjs approaches/gm-hint.mjs approaches/mf-iso.mjs approaches/gm-ref-hints6.mjs approaches/gm-ref-hints3.mjs approaches/gm-hint3.mjs
hints            mesh only, min of 11: mean 11.00 ms, median 12.86 ms, max 17.42 ms (apron 10)
gm-hint          mesh only, min of 11: mean 8.29 ms, median 8.74 ms, max 12.88 ms (apron 6)
mf-iso           mesh only, min of 11: mean 11.98 ms, median 11.12 ms, max 21.03 ms (apron 6)
gm-ref-hints6    mesh only, min of 11: mean 7.61 ms, median 7.54 ms, max 11.98 ms (apron 6)
gm-ref-hints3    mesh only, min of 11: mean 5.61 ms, median 5.81 ms, max 9.96 ms (apron 3)
gm-hint3         mesh only, min of 11: mean 6.08 ms, median 5.65 ms, max 9.61 ms (apron 3)

hints.mjs runs at apron 10 in the harness. The gm-ref-hints3 and gm-ref-hints6 rows are the production mesher at equal aprons. gm-hint3 is gm-hint at the unedited GEN_MESH apron 3.

node work/gm/timing-gen.mjs 11 (generator, 16 bench chunks):
38³ v1 (production)                    min of 11: mean 3.21 ms, median 3.46 ms
38³ v1 + S,D8 planes (gm-hint)         min of 11: mean 3.82 ms, median 4.07 ms
38³ v1 + S,D8,D16 planes (gm-slope)    min of 11: mean 4.51 ms, median 4.79 ms
52³ v1 (production)                    min of 11: mean 9.08 ms, median 9.27 ms
52³ v1 + S,D8 planes (gm-hint)         min of 11: mean 10.36 ms, median 10.64 ms
52³ v1 + S,D8,D16 planes (gm-slope)    min of 11: mean 12.41 ms, median 12.97 ms

An earlier quieter run measured 38³ at 2.50 → 2.89 ms and 52³ at 7.15 → 8.42 ms. The D16 row is obsolete: gm-slope now uses the D8 plane.

node work/gm/timing-edit.mjs 9 (edit path: 52³ REMESH-size regions, 6 chunks with painted lines and squares, placed planks and a dug pit inside):
hints          edited chunks (52³), min of 9: mean 14.46 ms, median 18.93 ms, max 23.04 ms
mf-iso         edited chunks (52³), min of 9: mean 21.05 ms, median 26.08 ms, max 35.08 ms
gm-hint        edited chunks (52³), min of 9: mean 18.09 ms, median 23.98 ms, max 27.32 ms
gm-slope       edited chunks (52³), min of 9: mean 20.03 ms, median 27.17 ms, max 30.76 ms
gm-hint per case: 363/1177 fallback quads, 87 dup, 3 fans; 599/5648 fallback quads, 150 dup, 17 fans; 484/6095 fallback quads, 148 dup, 13 fans; 455/1235 fallback quads, 90 dup, 7 fans; 187/5125 fallback quads, 82 dup, 3 fans; 0/1580 fallback quads, 0 dup, 0 fans

An earlier run measured hints 11.93, mf-iso 17.34 and gm-hint 14.87 ms.
```

## What it fixes

- Generated shoreline. The sand|grass boundary is measured in plan view against the generator's EXACT contour H = SEA + 2, over 16 bench chunks: std 0.329 → 0.019 blocks (hints → gm-hint), max 0.818 → 0.061, high-pass 0.176 → 0.014. mf-iso gives 0.145 std, with a 0.18-block bias into the sand. The rendered boundary lies on the exact curve (shore-exact.png).
- Every generated material boundary becomes a contour of a smooth field. Parabola-fit wiggle over all pairs: 0.276 (hints), 0.250 (mf-iso), 0.032 (gm-hint), 0.045 (gm-slope). grass|sand: 0.172 → 0.014.
- The dithered dirt specks and stripes on generated slopes, which are block-centre sampling artefacts (6.65 % of the top surface in hints, irregular blobs under mf-iso), do not appear under the literal rule (0.27 %, cave mouths only). With gm-slope they become smooth exposure patches on ground steeper than about 44° (5.20 %).
- Caves, cave mouths and dug holes: the top/dirt/stone layers are smooth D contours, placed where the block data puts them on average (δ = 0).
- Cost on unedited terrain is far below mf-iso's:
- mesh pass +0.47 ms per chunk at apron 3 (+0.68 ms at apron 6; mf-iso +4.4 ms at apron 6, plus 44³ generation);
- generator planes +0.4–0.6 ms at 38³;
- zero extra triangles or vertices (bench 6099 / 3326, the same as hints);
- no apron growth: 38³ stays.
- Player edits keep mf-iso's quality (a 1-wide painted diagonal is one continuous band; the 1:2 line is continuous) without mf-iso's staircase halo on the surrounding generated terrain. The gen/fallback border is continuous: 0.37 of 386.5 border-edge blocks differ (0.10 %).
- Geometry, collision and every constraint row are unchanged (hints).

## What it does not fix

- Surface jagginess: terraces and AO bands on generated slopes are still visible in every view. That is geometry and AO (gn, gs, gh); gm is material appearance only.
- Synthetic harness scenes: gm equals mf-iso there by construction, because they have no generator fields. Built and painted boundaries keep mf-iso's limits: square corners round (square-6 0.192), a lone block shows ×0.56, a checker merges, the 1:8 edge is 0.131.
- Rendered vs stored material. gm-hint shows a material other than the block's on 3.07 % of all surface, mostly grass over dirt-stripe blocks (2.91 %); mf-iso 2.29 %; gm-slope 6.58 %. Dig a 'grass' slope block and you may get dirt. Closing this needs the generator's BLOCK rule to follow the same continuous rule: a generator-output change, only before the D-24 freeze.
- Under the literal rule the natural surface is a uniform top skin. Whether that, slope exposures, or today's stripes is the right look is the owner's call (sheet-terrain.png, plan-final.png).
- A nearly flat H wanders, and so does its sand contour. That is faithful to the generator (the blocks wander too), but it is not 'straight'.

## Failure modes

- Thresholding a slowly varying field is ill-conditioned. Exposure outlines are smooth but their position is sensitive: α 0.6 / 0.7 / 0.8 gives 2.5 / 5.5 / 15.8 % dirt. Inward sampling along vertex normals (gm-b0) made them wander (wiggle 0.107), because surface vertices sit 0.035 std (p99 0.21) off D = 0. Any future rule of this kind needs per-block gradients and must not include the near-surface D.
- A |∇D|-based exposure rule (gm-g06) puts dirt blobs on flat ground, where the 3-D noise compresses D vertically. Without the shore fade, the slope rule turns steep beach banks to dirt (sand ×0.78).
- Mode border. 5-bit fallback codes cannot carry a slow gen contour with fixed ramps: the slope rule mismatched 5.6 % of the border. Gradient-scaled ramps bring that to 0.54 %. Small jogs remain at the edge of edited zones: 0.10 % for gm-hint.
- The fallback inherits mf-iso's own-relative clamping: 59 of 40,685 same-mode edges show a material jump in edited zones (mf-iso alone: 145).
- Production wiring.
- If a REMESH neighbour lacks planes, it must fall back to GEN_MESH (as hints already do).
- The apron decision must count material-only edits. Otherwise a painted block within 6 of a 38³ chunk is outside its region and its fallback disagrees with the neighbour's.
- Without planes the module silently degrades to mf-iso.
- The edit path costs more than the unedited path: +2.9–3.6 ms per chunk in this prototype. The zone test scans a 6³ window per corner, and the adaptive ramps take 7 trilinear lookups per zone corner. Both are unoptimised.

## Production fit

- **dataPath**: Generator (GEN_MESH worker): generateRegion writes two planes in its existing loop, from values it already computes:
- sQ = round(256·clamp(SEA+2−H, ±127)), Int16 per column;
- dQ = round(clamp(16·D, −128, 127)), Int8 per block.
blocks and hints are unchanged.

The worker returns the chunk's planes next to the hint plane. The main thread keeps them per loaded chunk, as it does hint planes, with a uniform 'saturated' marker when every D is ≥ 7.94 or every D is ≤ −8 (deep stone, sky). REMESH assembles them into the 52³ region the same way (assemble.ts), plus a per-cell 'edited solid' bit from the EditLog, which assemble.ts already computes as `edited`.

The mesh pass runs in the worker after positions and normals. No GPU buffers, textures or bindings are added.

Memory: +32 KiB (D) + 2 KiB (S) per surface chunk, about the hint planes again (est. +11–13 MiB at R = 192; not measured).

One rule change: an edit of ANY kind (painting included) within reach selects the 52³ region. Today only shape edits do.
- **vertexFormat**: 16-byte vertex unchanged.
- GEN mode (flags bit 3 = 1): bytes 13–15 hold S, a 12-bit signed code (±8 H-units, step 1/256), and E, a 12-bit unsigned code ([−1, 7), step 1/512). Byte 12 bits 3–7 and flags bit 2 are free.
- FALLBACK mode (bit 3 = 0): mf-iso's 30-bit layout, 6 × 5-bit r_m relative to the own material, in byte 12 bits 3–7, bytes 13–15 and flags bit 2.
A vertex used by quads of both modes is duplicated, so each triangle is single-mode and the mode can be a flat varying (provoking vertex).

The vertex shader decodes either mode into the same ≤ 6 float varyings (gen uses 2). The fragment gen path is e ≤ 1 → (s ≥ 0 ? sand : grass); e ≤ 4 → dirt; else stone: 2 compares + select. An optional fwidth band on the active field gives AA.

Measured: 12-bit codes match float on every real-terrain metric.
- **determinism**: Stored values come from integer planes and 1/256 positions, using only + − × ÷, √, floor, round, min/max, in a fixed order. Audit of gm-core.mjs and gen-gm.mjs: abs, floor, round, sqrt, min, max, imul. Math.exp only builds mf-iso's constant kernel table at load; production ships it as a literal.

The planes are intermediate values of the exact-ops generator: pure functions of (seed, version, cell).

Measured:
- generator copy: 0 of 4,105,080 cells differ (blocks, rho, shapeEdited) from lib/gen-mesh.mjs;
- the (S, D) rule reproduces all 2,669,469 solid blocks;
- generator seam test: 0 mismatches over 1,757 shared corner keys on 27 real-world border pairs. That covers aprons 3/6/10, edits straddling borders, and neighbours at aprons 3 vs 10.

Freeze contract (D-24, C-10): the existing generator goldens (blocks + hints per chunk) do not change. New plane goldens and re-emitted mesh goldens must land before the FROZEN marker (M8). A later change to the BLOCK material rule would re-emit the generator goldens and is likewise only possible before the freeze.
- **apron**: Gen path: reads blocks within ±1 of the vertex (±2 for gm-slope's central differences), so it runs on the unedited GEN_MESH region (apron 3, 38³). Verified seam-identical at aprons 3, 6 and 10, and with mixed 3/10 neighbours.

Fallback near edits: mf-iso's 6, inside the existing 52³ region.

The harness modules export 6 because the synthetic scenes run the fallback. gm-hint3.mjs (apron 3) is the production-shaped timing variant.

Unlike mf-iso, which needs 44³ everywhere, unedited chunks keep 38³.
- **cpuCost**: Interleaved min-of-N, 16 bench chunks, shared machine:
- mesh pass, unedited: +0.47 ms mean at apron 3 (5.61 → 6.08; medians 5.81 → 5.65, within noise) and +0.68 ms at apron 6 (7.61 → 8.29). mf-iso: +4.37 ms at apron 6 (7.61 → 11.98).
- generator planes: +0.39–0.61 ms at 38³ (+16–19 %) and +1.27–1.28 ms at 52³ (+14–18 %).
- unedited GEN_MESH total: about +0.9–1.1 ms per chunk (+11–14 %).
- edit path (52³ chunks with edits inside): +2.9 ms (11.93 → 14.87) or +3.6 ms (14.46 → 18.09) in two runs. mf-iso: +5.4 / +6.6 ms. Unoptimised zone test.
- gm-slope: +0.2–0.3 ms over gm-hint.
- **gpuCost**: Not measured on a GPU.
- Unedited terrain: 0 extra triangles and 0 extra vertices (6099 / 3326 per chunk, as hints; mf-iso 6174 / 3363).
- Edited chunks: 82–150 duplicated vertices plus mf-iso fans (3–17).
- Vertex size and bandwidth unchanged. Varyings as mf-iso (≤ 6 floats + a flat mode), or 2 floats if the fallback were dropped.
- Fragment gen path: 2 compares + select, cheaper than mf-iso's argmax. A second texture fetch only inside an optional ~1 px AA band.
- **physics**: Geometry is the production hints mesh, untouched, so collision and picking are unchanged. Every geometry and constraint row in compare.mjs equals hints. Fans exist only in fallback zones and lie in the planes of the kept triangles (as mf-iso). Flips happen only where the twist is ≤ 0.03 blocks. Material appearance never affects collision.
- **editability**: Dug holes need no fallback. The exposed blocks are generated, so walls show the D layers as smooth contours: the top skin about 1 block deep, then dirt, then stone below D = 4.

Placed, painted and replaced blocks use the fallback zone: corners within 3 blocks of a non-sharp edited solid surface block, data reach 6. That is inside the existing dirty set [b−9, b+10], so no extra chunks are remeshed per edit.

Generated blocks inside the zone act as background carrying the gen field. An edit therefore shows no halo of block-staircase materials, and its border with gen-mode terrain mismatches on 0.10 % of border length.

Sharp blocks stay crisp and open no zone (12 of 12 sharp triangles keep their own material). Edit latency: +2.9–3.6 ms per remeshed chunk in this prototype.

## Combines with

gm changes material appearance only.

Geometry and AO: it composes with any geometry or AO approach that keeps one vertex per lattice corner and the quad structure, such as gn-best AO from rho partial volume, or gs/gh for built shapes. It needs vertex positions (from any rule), mesh.corner, and quads with their lower block and axis. If a geometry rule moves vertices, gm evaluates the fields at the new positions, so materials stay consistent with the shape by construction.

Answer to question (4): on generated terrain gm should REPLACE a block-derived method. It is 7–8× closer to the exact boundary than mf-iso on the shore (0.019 vs 0.145 std), its wiggle is 0.032 vs 0.250, it costs about 1 ms vs about 4.4 ms plus 44³ generation per chunk, and it does not turn dithered dirt specks into blobs.

For player edits it must COMPLEMENT one: gm-hint already embeds mf-iso as the fallback, with the gen field as background. mx-contour or mv-fit could replace mf-iso inside that zone with the same background trick, and only there, since generated terrain no longer needs them.

Fragment finishing layers (fwidth AA band, low-contrast height-based blending, optional world-noise on E) sit on top.

## Variants tried

- **gm-a0 (tmpmods)**: Literal rule, float: e = D trilinear at the vertex, s = S bilinear.
  - Result: Shore std 0.018 vs the exact contour (hints 0.329). Dirt stripes vanish: plan dirt 6.65 % → 0.27 %. Only caves and cave mouths keep dirt or stone.
- **gm-b0 (tmpmods)**: Sample D half a block inside the surface along the vertex normal (e = D(p − 0.5n)) to keep exposures on steep ground.
  - Result: Smooth patches, but the outlines wander (grass|dirt wiggle 0.107). Cause: surface vertices sit 0.035 std (p99 0.21) off D = 0 and the vertex normals carry block-scale noise into a slowly varying field.
- **gm-g05…g08 (tmpmods)**: E = α·|∇D| + max(0, D − 0.3), with |∇D| from per-block central differences, trilinear.
  - Result: Plan dirt 0.8 / 4.7 / 16.6 / 34 % for α 0.5 / 0.6 / 0.7 / 0.8: a steep response. g06 matches today's amount of dirt (wiggle 0.058), but puts dirt blobs on FLAT ground where the 3-D noise compresses D vertically. Rejected for the look.
- **gm-s05…s08 (tmpmods)**: Explicit slope rule: E = α·|∇D|/|∂D/∂y| + max(0, D − δ), i.e. α/cos of the generator surface's slope.
  - Result: Plan dirt 1.0 / 2.5 / 5.5 / 15.8 %; wiggle 0.132 / 0.069 / 0.057 / 0.054. α = 0.7 is about today's dirt amount, as smooth patches on ground steeper than about 44°.
- **gm-g07n (tmpmods)**: Fragment-side world value noise (β 0.25) added to E, for organic outlines.
  - Result: Organic but noisier (wiggle 0.072) and too much dirt (17 %). Not pursued; it could be added later as an optional finishing layer.
- **encoding**: Float vs two 12-bit codes (S ±8 H-units, E over [−1, 7)).
  - Result: Identical on every real-terrain metric (gm-a3 vs gm-xhint).
- **D plane precision**: Int8 at 1/16 vs Int16 at 1/256.
  - Result: gm-hint: identical. gm-slope: wiggle 0.045 (Int8) vs 0.058 (Int16), plans visually identical. Int8 is kept for both, so one data path.
- **fallback ramps**: Fixed E ramps (±1.5 E-units) vs ramps scaled by the local |∇E| (1.5 blocks in space).
  - Result: Mode-border mismatch for gm-slope 5.6 % → 0.54 % of border length; gm-hint 0.06–0.10 %.
- **gm-slope shore fade**: Fade the slope term out over ±1.5 blocks around the sand contour.
  - Result: Without the fade, steep beach banks turned dirt (sand ×0.78). With it, sand ×1.02 and no dirt\|sand boundary.
- **δ for gm-hint**: Clip δ = 0.3 vs 0.
  - Result: δ = 0 puts dig-wall and cave layer boundaries where the blocks have them (D = 1 halfway between block centres). All-pairs wiggle 0.081 → 0.032; seams still identical. Kept δ = 0.
- **gm-hint (BEST)**: Literal continuous v1 rule: S + max(0, D), 2 × 12 bits, mf-iso fallback with the gen field as background near edits.
  - Result: Shore 0.019 std vs exact; wiggle 0.032; plan dirt 0.27 %. Mesh pass +0.47 ms (apron 3) / +0.68 ms (apron 6); generator planes +0.4–0.6 ms at 38³. No extra triangles or vertices on unedited terrain. Seams identical across 27 border pairs.
- **gm-slope (look option)**: gm-hint + slope exposures (α 0.7, shore fade).
  - Result: Smooth dirt patches on steep ground, 5.20 % of the top surface (hints 6.65 %); wiggle 0.045; border mismatch 0.54 %; seams identical; +0.2–0.3 ms over gm-hint.

## Open questions

- Owner look decision (sheet-terrain.png, plan-final.png): a uniform grass skin (gm-hint, the literal rule), smooth slope exposures (gm-slope, α tunable: 0.6 / 0.7 / 0.8 gives 2.5 / 5.5 / 15.8 % dirt), or keep today's dithered stripes (then gm only fixes the shoreline and cave layers). My proposal: gm-hint now; if exposures are wanted, the explicit slope rule.
- Should the generator's BLOCK material rule follow the chosen continuous rule, so a dug block matches what was shown? It would close the 3.1 % (gm-hint) or 6.6 % (gm-slope) stored-vs-shown gap, but changes generator goldens and is only possible before the D-24 freeze (M8).
- Memory for the D plane: about +1 byte per block on surface chunks (est. +11–13 MiB at R = 192, not measured). Accept it, or store D only where it cannot be derived from hints and material class? Cave walls are the case hints cannot cover.
- GPU cost on the i7-1255U iGPU at about 2 MP, and the AA band under MSAA: not measurable here. The gen path should be cheaper than mf-iso's argmax.
- Production edit-path optimisation, not done: a dilated edited mask for the zone test, and merging gen-mode vertices that are split only by material (fewer vertices on generated terrain).
- Generator v2 guidance: any new generated material (ores, snow, biomes) should be defined as a threshold of continuous fields, so it can ship hint planes too. Otherwise it reintroduces staircases.

## Harness issues reported

- The harness GEN_MESH input (bench.mjs, timing.mjs) carries no seed, origin or material planes, so a generator-field approach cannot run on it honestly. I added work/gm/shim.mjs: it recognises the 16 bench chunks of seed 1,1 by content, attaches the extended generator's planes for exactly that region after verifying the blocks are identical, and falls back otherwise. All real-terrain claims are also produced by work/gm tools (terrain-metrics.mjs, seams-gen.mjs, border.mjs, mismatch.mjs, timing-edit.mjs) that build the extended input explicitly. Suggest the harness pass (seed, chunk) or a plane hook.
- Synthetic scenes have no generator fields, so compare.mjs material rows for gm equal mf-iso by construction and say nothing about gm.
- harness/seams.mjs at a module's default apron 6 reports 3 normal mismatches in its shape-edited world for hints.mjs and mf-iso as well: the mesher needs apron 10 near shape edits. Run it at --apron 10, or have seams.mjs choose 10 when the world has shape edits.
- timing.mjs uses each module's own apron: hints.mjs at 10 (52³) against modules at 6 or 3, which flatters smaller-apron modules. I added approaches/gm-ref-hints3.mjs and gm-ref-hints6.mjs as equal-apron references. bench.mjs means stay very noisy (hints 28.6 ms in bench vs 11.0 ms in timing.mjs).
- There was no real-terrain metric with ground truth. I added:
- shoreline vs the exact H = SEA + 2 contour;
- parabola-fit wiggle with an occlusion filter (the first line-fit version counted cave-edge occlusions and penalised curvature);
- plan and 3-D area shares;
- stored-vs-shown mismatch;
- mode-border continuity.
- The generator samples block b at its integer corner, but the mesher treats rho as block-centre values, so the rendered world is offset ½ block from the continuous fields. Any exact reference (and any field-based approach) must use the same convention; work/gm/terrain-metrics.mjs does.
- `process.argv[1]` is undefined under `node -e`. Study scripts that use the `if (process.argv[1].endsWith(...))` CLI guard crash when imported that way. Mine use `?.`.

## Images (in the original run; not kept in this folder)

- work/gm/img/sheet-terrain.png
- work/gm/img/plan-final.png
- work/gm/img/shore-exact.png
- work/gm/img/sheet-edits-beach.png
- work/gm/img/sheet-edits-mtn.png
- out/gm-hint/img/terrain-beach-view.png
- out/gm-slope/img/terrain-mountain-view.png
