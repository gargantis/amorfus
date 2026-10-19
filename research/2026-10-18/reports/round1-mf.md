# Team mf: material vertex fields (round 1)

Verdict: **strong**. Best variant: `mf-iso` (approaches/mf-iso.mjs).

## How it works

Geometry is the production 'hints' mesh, untouched. Only material appearance changes.

1. Per-corner weights. For every lattice corner, a Gaussian kernel (σ 1.2 blocks, window ±2.5 blocks, a constant weight table) is summed over nearby SURFACE blocks. A surface block is solid, not sharp, and has an air 6-neighbour. The sum is 3-D, so slopes and steps count. The result is one normalised weight w_m per material.

2. Self-support guard. This runs first. For each surface block, its own material's share of the kernel at its own centre is measured. A block holding less than 55% is weighted up so that it holds exactly 55% (boost = τ(1−s)/((1−τ)s)). As a result:
   - lone blocks, 1-wide lines and thin dirt strips survive;
   - a 1-wide diagonal line connects through the corners its blocks share.

3. What goes in the vertex. Each vertex (corner, own material A) stores r_m = w_m − w_A for the 6 other materials. Each value is clamped to ±0.5 and quantised to a 5-bit signed code: 30 spare bits of the existing 16-byte vertex.

4. GPU decision. The GPU interpolates r linearly. The fragment shows the argmax over {A: 0, m: r_m}, with an optional fwidth blend over about 1 px. Every quad meeting at a corner derives r from the same weights, so each boundary is one continuous curve across quads, materials and triangles. Three-material junctions are consistent automatically, because r_B − r_C means the same thing on every quad.

5. Quads a boundary crosses. The kernel is evaluated at the lattice face centre, then:
   - if the other diagonal's midpoint matches the centre value better and the quad's twist is ≤ 0.03 blocks, the diagonal is flipped;
   - otherwise, if the kept diagonal would show the wrong winner at the centre, the quad becomes a 4-triangle fan around that diagonal's midpoint.
   Fan triangles lie exactly in the planes of the original two, so geometry and collision are unchanged; the fan gives lone blocks and line ends a sample at the block centre. Flips are essential: without them the 1:1 edge goes from 0.000 to 0.057 and the 1:2 edge from 0.006 to 0.033.

6. Sharp blocks are excluded from the kernel and stay one-hot, which keeps them crisp.

Result: block-scale jaggedness of material boundaries drops from 0.19–0.30 blocks (hints) and 0.05–0.21 (bevel) to 0.00–0.04 on every boundary scene. This is my supplementary high-pass metric, work/mf/highpass.mjs. What remains is smooth low-frequency lumpiness inherited from rasterisation phase (discs 0.12–0.14). A ±2.5 kernel cannot see it.

## Comparison (harness compare.mjs)

| scene | cubes | hints | bevel | mf-iso | mf-lite | mf-aniso |
|---|---|---|---|---|---|---|
| edge-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| edge-1:8 | 0.299 / 0.516 | 0.299 / 0.516 | 0.234 / 0.396 | 0.131 / 0.220 | 0.167 / 0.277 | 0.024 / 0.055 |
| edge-1:5 | 0.283 / 0.487 | 0.283 / 0.487 | 0.192 / 0.303 | 0.054 / 0.101 | 0.097 / 0.150 | 0.048 / 0.089 |
| edge-1:3 | 0.271 / 0.481 | 0.271 / 0.481 | 0.129 / 0.170 | 0.007 / 0.010 | 0.017 / 0.047 | 0.034 / 0.085 |
| edge-1:2 | 0.258 / 0.440 | 0.258 / 0.440 | 0.065 / 0.119 | 0.006 / 0.007 | 0.006 / 0.007 | 0.006 / 0.007 |
| edge-2:3 | 0.276 / 0.554 | 0.276 / 0.554 | 0.119 / 0.218 | 0.021 / 0.044 | 0.046 / 0.089 | 0.017 / 0.035 |
| edge-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| disc-r2.4 | 0.286 / 0.619 | 0.286 / 0.619 | 0.160 / 0.329 | 0.130 / 0.266 | 0.147 / 0.275 | 0.138 / 0.288 A |
| disc-r4.3 | 0.272 / 0.580 | 0.272 / 0.580 | 0.173 / 0.399 | 0.129 / 0.302 | 0.135 / 0.316 | 0.142 / 0.356 |
| disc-r7.6 | 0.297 / 0.679 | 0.297 / 0.679 | 0.198 / 0.448 | 0.148 / 0.364 | 0.159 / 0.399 | 0.149 / 0.373 |
| line1-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.009 / 0.028 | 0.000 / 0.000 | 0.024 / 0.116 |
| line1-1:1 | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.102 / 0.166 ACP | 0.000 / 0.000 A | 0.011 / 0.011 | 0.007 / 0.042 |
| line1-1:2 | 0.287 / 0.601 CP | 0.287 / 0.601 CP | 0.214 / 0.373 CP | 0.183 / 0.295 | 0.190 / 0.306 | 0.191 / 0.348 |
| line2-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.011 / 0.011 | 0.011 / 0.011 | 0.000 / 0.000 | 0.000 / 0.000 |
| square-6 | 0.000 / 0.000 | 0.000 / 0.000 | 0.072 / 0.208 | 0.192 / 0.468 | 0.110 / 0.282 | 0.172 / 0.348 |
| single | area ×1.00, 1 part | area ×1.00, 1 part | area ×0.25, 1 part A | area ×0.56, 1 part A | area ×0.56, 1 part A | area ×0.56, 1 part A |
| checker | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×0.74, 18 parts A | area ×1.33, 1 part A | area ×1.46, 1 part A | area ×1.35, 1 part A |
| junction3 | 0.296 / 0.661 | 0.296 / 0.661 | 0.147 / 0.318 | 0.085 / 0.152 | 0.097 / 0.164 | 0.043 / 0.101 |
| hill-materials | 0.292 / 0.627 | 0.330 / 0.696 | 0.291 / 0.808 | 0.142 / 0.350 | 0.168 / 0.475 | 0.170 / 0.386 |
| ramp-1:1 | 45.0° / 45.0° ao 0.108 | 0.1° / 0.5° ao 0.103 | 17.0° / 18.4° ao 0.108 | 0.1° / 0.5° ao 0.103 | 0.1° / 0.5° ao 0.103 | 0.1° / 0.5° ao 0.103 |
| ramp-1:2 | 43.0° / 63.4° ao 0.075 | 5.6° / 8.7° ao 0.076 | 24.5° / 33.8° ao 0.076 | 5.6° / 8.7° ao 0.076 | 5.6° / 8.7° ao 0.076 | 5.6° / 8.7° ao 0.076 |
| ramp-1:4 | 34.2° / 76.0° ao 0.041 | 10.6° / 19.6° ao 0.041 | 22.0° / 46.3° ao 0.041 | 10.6° / 19.6° ao 0.041 | 10.6° / 19.6° ao 0.041 | 10.6° / 19.6° ao 0.041 |
| ramp-1:8 | 30.0° / 82.9° ao 0.043 | 11.5° / 26.5° ao 0.029 | 20.2° / 53.2° ao 0.043 | 11.5° / 26.5° ao 0.029 | 11.5° / 26.5° ao 0.029 | 11.5° / 26.5° ao 0.029 |
| ramp-diag-1:2.8 | 46.7° / 76.4° ao 0.070 | 8.1° / 15.8° ao 0.074 | 43.2° / 70.9° ao 0.072 | 8.1° / 15.8° ao 0.074 | 8.1° / 15.8° ao 0.074 | 8.1° / 15.8° ao 0.074 |
| mound-r6.4 | 48.4° / 83.5° ao 0.069 | 7.8° / 20.8° ao 0.075 | 34.5° / 81.4° ao 0.070 | 7.8° / 20.8° ao 0.075 | 7.8° / 20.8° ao 0.075 | 7.8° / 20.8° ao 0.075 |
| pit-r5.4 | 48.3° / 81.5° ao 0.132 | 9.4° / 32.4° ao 0.146 | 36.4° / 69.1° ao 0.132 | 9.4° / 32.4° ao 0.146 | 9.4° / 32.4° ao 0.146 | 9.4° / 32.4° ao 0.144 |
| terrace-disc | 0.291 / 0.728 | 0.219 / 0.486 | 0.206 / 0.490 | 0.218 / 0.485 | 0.219 / 0.486 | 0.214 / 0.491 |
| terrace-1:2 | 0.261 / 0.447 | 0.133 / 0.243 | 0.088 / 0.206 | 0.133 / 0.243 | 0.133 / 0.243 | 0.133 / 0.243 |
| tower-r4.6 | 0.341 / 0.616 | 0.170 / 0.338 | 0.233 / 0.478 | 0.170 / 0.338 | 0.170 / 0.338 | 0.170 / 0.338 |
| hinted-slope-1:4 | 34.2° / 76.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 16.1° / 31.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 |
| hinted-hill | 45.7° / 87.7° ao 0.061 | 0.8° / 2.8° ao 0.065 | 34.7° / 81.1° ao 0.061 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 |
| floating-block | ok 1.00 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 |
| pillar | ok 1.00 | ok 0.40 | ok 0.50 | ok 0.40 | ok 0.40 | ok 0.40 |
| tunnel-1x2 | ok 1.05 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 |
| roof-2-high | ok 2.00 | ok 1.90 | ok 2.00 | ok 1.90 | ok 1.90 | ok 1.90 |
| sharp-wall | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 |
| mesh ms (all scenes) | 690 | 765 | 706 | 697 | 608 | 2700 |

## Real-terrain bench

```
mf-iso: 27.6 ms mean, 118.7 ms max per chunk (apron 6); 6174 triangles, 3363 vertices per chunk
```



## What it fixes

- Straight material edges stop being staircases (compare std, hints → mf-iso): 1:1 0.204 → 0.000; 1:2 0.258 → 0.006; 1:3 0.271 → 0.007; 2:3 0.276 → 0.021; 1:5 0.283 → 0.054; 1:8 0.299 → 0.131.
- Block-scale jaggedness (high-pass std, after removing each boundary's own ±1-block moving average) falls from 0.19–0.30 (hints) and 0.05–0.21 (bevel) to 0.000–0.037 on every boundary scene. Source: work/mf/highpass.mjs.
- The owner's 1-wide diagonal line now renders as one continuous straight band of constant width: line1-1:1 std 0.000, 1 part, no pinch, width 0.95 against an ideal 0.71. The 1:2 line is continuous too, with per-side std 0.04.
- Curves and junctions: discs go from 0.27–0.30 to 0.13–0.15. The three-material junction becomes a clean Y (0.296 → 0.085). The stone disc and sand edge on the hill go from 0.330 to 0.142.
- Real terrain (bench views and close-ups): the sand/grass shore and grass/dirt patches become smooth curves instead of stair-stepped stripes. Displayed material areas stay close to the block-face areas: grass ×1.01, sand ×0.97, stone ×1.00, dirt ×0.89.
- A lone block survives as a small dot (area ×0.56); the bevel rule shrinks it to ×0.25.
- Geometry, collision and every constraint are untouched: all geometry rows in compare.mjs equal hints.

## What it does not fix

- Surface jagginess (terraces, facets, AO bands on slopes) is untouched; geometry is the hints mesh. That part of the owner's request belongs to the geometry and AO teams.
- Low-frequency lumpiness inherited from rasterisation remains: discs 0.13–0.15 (low-pass 0.12–0.14) and the 1:8 edge 0.131 as a gentle 8-block S-wave. Block-centre sampling loses where a curve crosses a block (disc-r7.6 sits 0.46 inside the ideal circle at 180° in the raw blocks too). A ±2.5 kernel cannot see it. The anisotropic kernel fixes shallow straight edges only.
- Square corners round, with radius about 1.5 blocks (square-6 0.192 against a crisp ideal); mf-lite gives 0.110. Crisp patterns need sharp blocks.
- Checkerboards merge into one rounded patch (area ×1.33, 1 part). Lone blocks become small square dots (×0.56); a round dot is below the vertex grid's resolution.
- Thin-feature widths are only approximately right: 1-wide 1:1 line ×1.34, horizontal ×1.13, 2-wide band ×0.75.
- At creases, the boundary sits at the 3-D mass balance: grass creeps about half a block up the lower face of a placed block of another material standing on grass.
- Up close, a boundary is a polyline with kinks at triangle edges (2–3 segments per block).

## Failure modes

- The guard is calibrated per kernel. Changing σ or the window needs a new τ, and the response is steep: at σ 1.5, τ 0.52 makes lines vanish, 0.55 makes them 1.4–1.6× wide, 0.58 makes them 2×. The support must be measured with the same full kernel: a ±1 support window with the ±2.5 field made every line vanish.
- Isolated exposed blocks on step risers can vanish (terrain dirt area ×0.89 with mf-iso, ×0.76 with mf-lite). Measuring support at the rendered face instead over-boosts (×1.39).
- Fans zigzag with a 1-block period wherever the field is strongly non-linear across a quad. The 'auto' rule fans only where the kept diagonal shows the wrong winner, which avoids this on all measured scenes; normal-aware weighting re-triggers it.
- The 3-D kernel reaches up to 2.5 blocks, so material can be counted through a 1-thick wall or a thin overhang. The generator's caves start 4 blocks below the surface, out of reach.
- Flips are allowed only where the quad twist is ≤ 0.03 blocks. On curved terrain most wanted flips are blocked (25% allowed); the face-centre fan covers the cases where it matters.
- CPU cost: on today's unedited path (38³), per-chunk worker time goes from 10.6 ms to 18.3–20.7 ms. A JS field pass slower than measured would threaten the edit-latency budget (+5.8 ms per remeshed chunk against C-12's 33 ms p95).

## Production fit

- **dataPath**: A CPU pass in the mesh worker after positions and normals: no new GPU buffers, textures or storage buffers.
- Per surface block within reach of the chunk: a self-support sum over the 5×5×5 integer-offset window, giving its boost.
- Per lattice corner: a 6×6×6 kernel sum, giving 8 weights, then 6 codes per vertex.
- Per quad the boundary crosses: a kernel sum at the face centre (6×5×5) decides the flip or fan.
Fields are cached per corner in a dense 33³ table. Flips reorder indices. Fans append 1 vertex and 2 triangles per fanned quad. The CPU collision copy can keep 2 triangles per quad (pick records unchanged), because fans are coplanar.
- **vertexFormat**: The 16-byte vertex is unchanged.
- Contents: 6 weights r_m = w_m − w_own, one for each material in 1–7 except own, each a 5-bit code q ∈ −15…15 (r = q/30, clamp R = 0.5). Total 30 bits.
- Placement: byte 12 bits 3–7 (the id keeps bits 0–2), bytes 13–15 (the reserved uint8x4 yzw), and flags bit 2.
- Smaller alternatives: 6 × 4 bits fits bytes 13–15 exactly, at a small cost (1:3 edge 0.024 vs 0.007, hill max 0.396 vs 0.350). While material 7 stays unused, 5 × 5 bits fits byte 12 high bits plus bytes 13–15.
- Vertex shader: decode to vec4f + vec2f varyings, perspective-interpolated.
- Fragment shader: own material (flat, from the provoking vertex; all vertices of a quad and its fan share it) wins unless some interpolated r_m > 0; the slot-to-material map skips own. Optional AA: t = clamp(r_max/fwidth(r_max) + 0.5, 0, 1), mixing the two albedos, with the second triplanar fetch only inside that ~1 px band.
- **determinism**: All stored values are deterministic:
- Sums of constant weights (a literal table, generated offline) times boosts, in a fixed loop order, in f64.
- Boosts and ratios use only + − × ÷ and comparisons; the twist test uses one √.
- Codes come from Math.round.
No exp, pow or trig at runtime. Measured: every scene gives identical results from the fast path and the prototype (0 attribute and 0 index differences on 19 scenes and 4 terrain chunks). Fields are identical at aprons 6, 7 and 10 (0 of 53,218 vertices differ on 16 chunks). 361 vertices shared across 6 neighbour-chunk seams: 0 differ.
- **apron**: 6 (verified; apron 5 changes 25 of 53,218 fields).
- Reach: the corner window [c−3, c+2], plus each of those blocks' support window ±2, plus the surface test ±1, gives blocks [c−6, c+5].
- Cost: the unedited GEN_MESH path must generate 44³ instead of 38³. The edited 52³ path and REMESH already cover it.
- mf-lite needs apron 4 (40³), also verified.
- mf-aniso: about 15, estimated and not seam-verified.
- **cpuCost**: Interleaved medians per chunk, 16 bench chunks, shared machine:
- field pass: 5.8 ms (JS typed arrays; profile: support 1.7, corners 2.8, quads 0.8, fans 0.1);
- generation: 3.7 ms at 38³, 5.7 ms at 44³;
- hints mesher: 6.8 ms at 38³, 9.2 ms at 44³ (avoidable if the mesher's passes stay on the 38³ core);
- unedited path total: 10.6 → 18.3–20.7 ms (+72–95%);
- edited path and REMESH: +5.8 ms per chunk.
mf-lite: field 2.8 ms, generation 4.5 ms, unedited +33–46%. Harness bench (includes the base mesh, noisy): 27.6 ms mean at apron 6.
- **gpuCost**: Not measured on a GPU; estimated.
- Terrain chunks: +1.2% triangles and +1.1% vertices (fans), against a budget of ≤ 25%.
- Vertex size and bandwidth unchanged.
- +6 interpolated floats (2 varyings).
- Fragment: about 15–25 extra ALU ops (6 compares, slot map, fwidth). A second triplanar sample set only for pixels within ~1 px of a boundary.
On the i7-1255U this should be a few percent of a fragment cost dominated by 3 triplanar fetches plus fog.
- **physics**: Geometry is unchanged.
- Fans lie in the planes of the existing triangles; the centre is the kept diagonal's midpoint, rounded to 1/256, at most 0.002 blocks off.
- Flips happen only where twist ≤ 0.03 blocks (0.54% of terrain quads), so collision moves at most 0.03 blocks there.
- Every geometry and constraint row in compare.mjs equals hints.
- Material appearance never affects collision or picking (what you see is what you hit holds).
- **editability**: No extra chunks per edit: a corner's field depends on blocks in [c−6, c+5], inside the existing dirty-set reach [b−9, b+10] for k = 6. Material-only edits (painting) now update the boundary smoothly within about 2.5 blocks. Sharp blocks are excluded from the kernel and stay crisp, which gives players an opt-out for crisp patterns (checkers, square corners). Edit latency: +5.8 ms per remeshed chunk (mf-lite +2.8).

## Combines with

It changes only material appearance, so it composes with any geometry or AO approach from the other teams that keeps one vertex per lattice corner and the quad structure. It needs mesh.corner, quads and their lower block and axis. The weights are computed from blocks alone, independent of vertex positions.

Interactions with a geometry rule:
- Flips respect the geometry rule's surface: only quads with twist ≤ 0.03 flip, and fans lie in the existing triangles.
- If a geometry rule subdivides or retriangulates, evaluate the same kernel at each new vertex's lattice-space position.

Within this team: mf-soft is a fragment-only swap on the same mesh. mf-lite is a cheaper parameter set of the same pass. The anisotropic kernel could be gated in for long straight player-built edges if its cost is accepted.

## Variants tried

- **sweep: box 2×2 counts, no guard (spike-like)**: weights = 2×2 block counts at each corner, as in the smoothing-boundaries spike, without its face-centre guard
  - Result: edges improve somewhat (1:5 0.150, 1:3 0.091) but 1:8 0.200 and 1:1 0.204. 1-wide diagonal line and lone block vanish (ties at shared corners). Checker ×0.44.
- **sweep: Gaussian σ 0.6 / 0.8 / 1.0 / 1.2 / 1.5**: kernel width (window ±2.5; ±3.5 for 1.5)
  - Result: Wider is better for edges and discs. With flips: 1:5 0.149 → 0.068 → 0.036 and 1:3 0.070 → 0.009 going from σ 0.6 to 1.2 to 1.5. Discs saturate at 0.12–0.15. Square corners round more (0.15 → 0.22). Without a guard, thin lines vanish at every σ ≥ 0.6.
- **sweep: kernel shapes**: cubic B-spline (scale 1.5, 2), radial (1−r²/R²)², Gaussian truncated at 2.5 vs 3.5
  - Result: At equal effective width, shape changes std by ≤ 0.02. Width is what matters.
- **guard: neighbour-count boost**: boost by the share of same-material blocks among the 26 neighbours
  - Result: Cannot calibrate across line orientations (horizontal line 1.56 wide, 1:1 line 0.35). Lone block still vanishes.
- **guard: self-support τ (chosen, τ 0.55)**: lift a block's own share at its own centre to τ
  - Result: At σ 1.2: lines continuous (1:1 width 0.95, 1:2 0.94–1.04, horizontal 1.13), lone block survives with fans. Very sensitive at wider σ: at σ 1.5, τ 0.52 → lines vanish; 0.55 → 1.4–1.6× wide; 0.58 → 2×.
- **guard: best-corner support τ 0.58**: lift the own share at a block's best surface corner
  - Result: Over-boosts with wide kernels: lines 1.5–1.9× ideal, lone block area ×3–3.9.
- **diag: flip by face-centre value**: swap a boundary quad's diagonal toward the one whose midpoint matches the kernel at the face centre
  - Result: At σ 0.8: 1:1 0.133 → 0.000, 1:2 0.089 → 0.006, 1-wide diagonal line becomes a continuous band. On real terrain 3% of quads want a flip, median twist 0.12 blocks; only 25% have twist ≤ 0.03.
- **diag: fan every boundary quad**: 4-triangle fan around the existing diagonal's midpoint (geometry-neutral)
  - Result: Works for lone blocks. But it zigzags with a 1-block period wherever the field curves across a quad: 1:1 edge 0.011 instead of 0.000, sawtooth fringe at a wall foot.
- **diag: auto (winner-based)**: fan or flip only when the diagonal's midpoint shows the wrong winner
  - Result: Too coarse: 1:1 edge 0.059, 1:2 0.030.
- **diag: auto (value-based flip + wrong-winner fan) — chosen**: flip when twist ≤ 0.03; fan only if the kept diagonal shows the wrong winner at the centre
  - Result: Equals pure flips on straight edges (1:1 0.000, 1:2 0.006) and keeps the lone block. Terrain: +1.2% triangles, 0.54% of quads flipped.
- **mf-flip**: same field as mf-iso, flips only, float weights
  - Result: Like mf-iso on edges, but the lone block vanishes (area ×0, C) and the hill is no better (0.142).
- **encoding: R and bits**: clamp R 0.3 / 0.5 / 1.0; 4 / 5 / 6 bits vs float
  - Result: R 0.5 is lossless vs no clamp; R 0.3 hurts (1:3 0.023). 5 bits ≈ float. 4 bits slightly worse (1:3 0.024 vs 0.007, hill max 0.396 vs 0.350).
- **normal-aware weights (linear, ramp, near-binary)**: weight each block by how much its exposed faces face the vertex normal
  - Result: Stops grass creeping up the face of a 2-high brick block. But it puts a ragged or sawtooth planks fringe on the ground at a 1-thick wall's foot: the field becomes non-smooth on the fillet. Rejected.
- **support at the exposed face centre (mf-isof, removed)**: measure self-support where the block is rendered, not at its centre
  - Result: Identical on flat ground, but over-boosts riser blocks on real terrain: dirt area ×1.39 vs block faces. Rejected.
- **mf-lite**: σ 0.9, window ±1.5, τ 0.60, apron 4
  - Result: Best thin features: 1-wide lines at ideal width (horizontal 1.00, 1:1 0.71, 1:2 0.80–0.97); square 0.110. Half the field cost (2.8 ms). Worse shallow edges (1:8 0.167, 1:5 0.097), hill 0.168, terrain dirt ×0.76.
- **mf-aniso**: polynomial kernel narrow across (Ln 1.8), long along (≤ 5) the boundary; direction from the covariance of boundary block-pairs within 3
  - Result: Shallow edges near-perfect (1:8 0.024, low-pass 0.018) and line widths calibrated (1:1 0.70, 2-wide 1.29). Discs no better, hill worse (0.170). Dirt becomes streaks along contours (×0.69 area). Field ~5× slower in this prototype; apron ≈ 15 estimated, not seam-verified.
- **curve-following kernel**: aniso kernel measuring the across distance from a fitted osculating parabola
  - Result: Fails: the fit reads spurious curvature from staircase steps (1:8 0.143 → 0.218); discs no better (0.13–0.17).
- **lone-block τ1**: higher τ for blocks with self-support ≤ 0.15
  - Result: Area jumps 0.56 → 1.00 → 1.40 between τ1 0.55, 0.565 and 0.58, and every step is a square (a round dot is below the vertex grid's resolution). Kept τ1 = τ.
- **fanThin**: fan every quad of a boosted (thin-feature) block
  - Result: No gain (1:2 line 0.184); the 1:2 score is a reference bias, see harnessIssues.
- **mf-soft**: mf-iso weights; fragment adds per-material value-noise heights (amp 0.35, freq 0.8) for grass/dirt/stone/sand
  - Result: Organic outlines (coast-like sand edge, erosion-like dirt). Dirt area ×1.02. Std rises by design (edges 0.10–0.22).

## Open questions

- What the fragment argmax and 1-px fwidth blend cost on the i7-1255U iGPU at about 2 MP, and how the blend behaves under 4× MSAA (the boundary runs inside triangles, so MSAA does not anti-alias it). Not measurable here.
- Owner taste: rounded square corners and merged checkers for smooth blocks, with the sharp bit as the crisp opt-out, or a narrower kernel for shape-edited (player-built) regions? mf-lite-like parameters give square-6 0.110 and ideal line widths.
- Is +72–95% worker time per unedited chunk acceptable for initial fill and sprint-flying, or should mf-lite (+33–46%) ship first? Expected production speed-up of the 5.8 ms JS pass: probably about 2× with tighter integration in the mesher's corner arrays.
- Is the anisotropic kernel's straight-edge gain (1:8 0.131 → 0.024) worth an apron of about 15 and roughly 5× the field cost (as prototyped) for player builds only?
- Whether a large-window fit (MLS signed distance with curvature over about ±8 blocks) could remove the remaining disc and shallow-edge lumpiness. My local parabola fit failed on staircase noise.
- Generated terrain only: the generator knows the continuous surface depth and height, so an analytic material field would be exact. But dirt exposure on steep slopes is itself a discretisation artefact of the vertical-depth rule, so the material rule would have to change.
- Soft blend: per-material-pair amplitude and frequency, and whether noisy outlines read as natural or as a new kind of jagginess to the owner.

## Harness issues reported

- line1-1:2 reference bias: the scene's Bresenham rounding puts the line's block centres 0.179 off the ideal centreline (measured with work/mf/bandcheck.mjs). compare.mjs pools both band sides, so any band that follows the blocks faithfully scores std ≈ 0.18: mf-iso's band is centred at +0.178 with per-side std 0.043 / 0.041. Suggest per-side std, or centring the ideal on the blocks.
- compare.mjs std mixes block-scale jaggedness with low-frequency lumpiness inherited from rasterisation phase (discs, shallow edges). I added a high-pass / low-pass split over ±1 block of arc length in work/mf/highpass.mjs, without touching the harness.
- bench.mjs times mesh() only. It does not show the generation cost of a wider apron (38³ 3.7 ms, 44³ 5.7 ms, 52³ 9.0 ms medians), and it is noisy on the shared machine: hints measured 22.5 ms in the README but 41–43 ms during this run. I used interleaved medians in work/mf/timing2.mjs.
- There is no real-terrain material-balance metric. I added work/mf/areas.mjs: displayed area per material against block-face area on the 16 bench chunks.
- There is no scene with a smooth-block wall or step of another material standing on ground, where crease bleed shows. I added one in work/mf/custom.mjs.
- The fragment contract returns a hard material id, so the 1-px anti-aliasing blend cannot be shown or measured.

## Images (in the original run; not kept in this folder)

- out/mf-iso/img/terrain-beach-view.png
- out/mf-iso/img/terrain-mountain-view.png
- work/mf/img/mtn-close-hints-vs-mf-iso.png
- work/mf/img/beach-close-hints-vs-mf-iso.png
- out/mf-iso/img/line1-1:1-plan.png
- work/mf/img/mf-iso-sheet.png
- work/mf/img/iso-vs-aniso.png
- out/mf-soft/img/terrain-mountain-view.png
