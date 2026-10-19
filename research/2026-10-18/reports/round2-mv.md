# Team mv: boundary fitting (continue) (round 2)

Verdict: **promising**. Best variant: `mv-quad` (approaches/mv-quad.mjs).

## How it works

Geometry is the production 'hints' mesh, untouched. Only the material shown on each quad changes, through 3 bytes per vertex. The code is in work/mv/: pipe6.mjs, fit2d-fast.mjs, dssfast.mjs, lp4.mjs and lp.mjs.

1. Plan label map. From the region's blocks, list every column's surface tops. M* is the topmost top of each column, with its material and height. A corner at level Y uses M* except at columns with several tops, where the top nearest Y wins. Fits are shared across levels wherever a window has no such column. A linel is a material boundary only if the two columns differ by at most 1 in height. Taller steps (cliffs, walls) cut the chain, so a wall top never bleeds onto the ground at its foot.

2. Chains. Each map's boundary linels are linked once into chains. Each chain is oriented with the lower material id on its left. At a diagonal saddle, the material with fewer pixels in the 4×4 block connects, so 1-wide diagonal lines stay one piece. Checkerboard clusters (a saddle with 3 or more saddle neighbours) are left as blocks.

3. Canonical fit per boundary linel. The window is the chain inside a 14×14 box around the pointel, at most 21 steps each way. Computed in coordinates relative to the pointel, the fit is one of:
   - a deliberate corner or cap: two arms of 5 or more steps, each holding 2 or more periods of a digital straight segment and turning by at least 60°;
   - otherwise, if the window is one digital straight segment (exact integer recogniser), its centre line;
   - otherwise a max-margin arc g = κ/2|p|² + (n0 + u·t0)·p + c separating the pixel centres on the two sides. This is a 4-variable LP solved by an active-set simplex with Bland's rule, then refined by 16 Newton steps toward the analytic centre;
   - otherwise the λ-MST tangent.

4. Pieces per quad. For each quad near a boundary, the chains within 3.5 blocks of the quad centre become pieces, split at corners. A piece's signed distance blends its fits with a (1−d²/h²)² bump (h = 2). Far from all of a piece's points it falls back to "own side" instead of extrapolating a curve past the piece's end. A 1-block step moves the boundary toward the step's foot by 0.5·m·|m|, where m is the mean step across the piece; the riser belongs to the upper block.

5. Choice per quad. The two nearest pieces at the quad centre are chosen, in canonical order. AND or OR is chosen by testing which reproduces the 3×3 labels around the quad. Both distances are evaluated at the quad's 4 vertices, so every triangle interpolates the same two functions. A vertex shared by quads that need different values is duplicated. A difference only in the flat byte is resolved by rotating each triangle so that its provoking vertex carries the quad's byte.

6. Encoding and GPU. Each vertex stores b0 = o1 | o2<<3 | op<<6 | valid<<7, and s1, s2 as i8 at 1/64 block (±1.98). The fragment shows its own material if (op ? s1>0 && s2>0 : s1>0 || s2>0); otherwise it shows o1 if s1 ≤ s2, else o2.

## Comparison (harness compare.mjs)

| scene | cubes | hints | mv-quad | mx-contour | mf-iso |
|---|---|---|---|---|---|
| edge-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| edge-1:8 | 0.299 / 0.516 | 0.299 / 0.516 | 0.010 / 0.026 | 0.048 / 0.134 | 0.131 / 0.220 |
| edge-1:5 | 0.283 / 0.487 | 0.283 / 0.487 | 0.008 / 0.015 | 0.039 / 0.064 | 0.054 / 0.101 |
| edge-1:3 | 0.271 / 0.481 | 0.271 / 0.481 | 0.009 / 0.015 | 0.009 / 0.015 | 0.007 / 0.010 |
| edge-1:2 | 0.258 / 0.440 | 0.258 / 0.440 | 0.006 / 0.007 | 0.006 / 0.007 | 0.006 / 0.007 |
| edge-2:3 | 0.276 / 0.554 | 0.276 / 0.554 | 0.007 / 0.018 | 0.009 / 0.018 | 0.021 / 0.044 |
| edge-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.011 / 0.011 | 0.000 / 0.000 | 0.000 / 0.000 |
| disc-r2.4 | 0.286 / 0.619 | 0.286 / 0.619 | 0.047 / 0.106 | 0.113 / 0.286 | 0.130 / 0.266 |
| disc-r4.3 | 0.272 / 0.580 | 0.272 / 0.580 | 0.098 / 0.191 | 0.144 / 0.311 | 0.129 / 0.302 |
| disc-r7.6 | 0.297 / 0.679 | 0.297 / 0.679 | 0.102 / 0.239 | 0.173 / 0.381 | 0.148 / 0.364 |
| line1-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.009 / 0.028 |
| line1-1:1 | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.011 / 0.011 | 0.000 / 0.000 | 0.000 / 0.000 A |
| line1-1:2 | 0.258 / 0.440 CP | 0.258 / 0.440 CP | 0.006 / 0.007 | 0.007 / 0.034 | 0.043 / 0.117 |
| line2-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.011 / 0.011 | 0.017 / 0.036 | 0.000 / 0.000 |
| square-6 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 | 0.192 / 0.468 |
| single | area ×1.00, 1 part | area ×1.00, 1 part | area ×1.00, 1 part | area ×1.00, 1 part | area ×0.56, 1 part A |
| checker | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×0.99, 3 parts | area ×1.33, 1 part A |
| junction3 | 0.296 / 0.661 | 0.296 / 0.661 | 0.015 / 0.041 | 0.029 / 0.098 | 0.085 / 0.152 |
| hill-materials | 0.292 / 0.627 | 0.330 / 0.696 | 0.063 / 0.130 | 0.135 / 0.318 | 0.142 / 0.350 |
| ramp-1:1 | 45.0° / 45.0° ao 0.108 | 0.1° / 0.5° ao 0.103 | 0.1° / 0.5° ao 0.103 | 0.1° / 0.5° ao 0.103 | 0.1° / 0.5° ao 0.103 |
| ramp-1:2 | 43.0° / 63.4° ao 0.075 | 5.6° / 8.7° ao 0.076 | 5.6° / 8.7° ao 0.076 | 5.6° / 8.7° ao 0.076 | 5.6° / 8.7° ao 0.076 |
| ramp-1:4 | 34.2° / 76.0° ao 0.041 | 10.6° / 19.6° ao 0.041 | 10.6° / 19.6° ao 0.041 | 10.6° / 19.6° ao 0.041 | 10.6° / 19.6° ao 0.041 |
| ramp-1:8 | 30.0° / 82.9° ao 0.043 | 11.5° / 26.5° ao 0.029 | 11.5° / 26.5° ao 0.029 | 11.5° / 26.5° ao 0.029 | 11.5° / 26.5° ao 0.029 |
| ramp-diag-1:2.8 | 46.7° / 76.4° ao 0.070 | 8.1° / 15.8° ao 0.074 | 8.1° / 15.8° ao 0.074 | 8.1° / 15.8° ao 0.074 | 8.1° / 15.8° ao 0.074 |
| mound-r6.4 | 48.4° / 83.5° ao 0.069 | 7.8° / 20.8° ao 0.075 | 7.8° / 20.8° ao 0.075 | 7.8° / 20.8° ao 0.075 | 7.8° / 20.8° ao 0.075 |
| pit-r5.4 | 48.3° / 81.5° ao 0.132 | 9.4° / 32.4° ao 0.146 | 9.4° / 32.4° ao 0.146 | 9.4° / 32.4° ao 0.146 | 9.4° / 32.4° ao 0.146 |
| terrace-disc | 0.291 / 0.728 | 0.219 / 0.486 | 0.219 / 0.486 | 0.219 / 0.486 | 0.218 / 0.485 |
| terrace-1:2 | 0.261 / 0.447 | 0.133 / 0.243 | 0.133 / 0.243 | 0.133 / 0.243 | 0.133 / 0.243 |
| tower-r4.6 | 0.341 / 0.616 | 0.170 / 0.338 | 0.170 / 0.338 | 0.170 / 0.338 | 0.170 / 0.338 |
| hinted-slope-1:4 | 34.2° / 76.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 |
| hinted-hill | 45.7° / 87.7° ao 0.061 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 |
| floating-block | ok 1.00 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 |
| pillar | ok 1.00 | ok 0.40 | ok 0.40 | ok 0.40 | ok 0.40 |
| tunnel-1x2 | ok 1.05 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 |
| roof-2-high | ok 2.00 | ok 1.90 | ok 1.90 | ok 1.90 | ok 1.90 |
| sharp-wall | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 |
| mesh ms (all scenes) | 859 | 996 | 1097 | 1046 | 863 |

## Real-terrain bench

```
mv-quad: 49.0 ms mean, 190.5 ms max per chunk (apron 10); 6099 triangles, 3957 vertices per chunk
```

## Seams

```
harness/seams.mjs approaches/mv-quad.mjs (apron 10), verbatim:
  x-border mismatch at c32,10,23,m1,s0: 8192|2519|5888|0.1938|0.9522|-0.2361|255|1.28125|1.28125 ; 8192|2519|5888|0.1938|0.9522|-0.2361|255|1.28125|1.67188  vs  8192|2519|5888|0.1938|0.9522|-0.2361|255|1.28125|1.28125
  x-border mismatch at c32,10,24,m1,s0: 8192|2588|6144|0.1953|0.9419|-0.2733|245|-1.70313|0.56250 ; 8192|2588|6144|0.1953|0.9419|-0.2733|245|0.56250|-0.65625  vs  8192|2588|6144|0.1953|0.9419|-0.2733|245|0.56250|-0.32813 ; 8192|2588|6144|0.1953|0.9419|-0.2733|245|0.56250|0.56250
  x-border mismatch at c32,10,25,m1,s0: 8217|2663|6395|0.1943|0.9319|-0.3063|222|-0.89063|0.01563  vs  8217|2663|6395|0.1943|0.9319|-0.3063|222|0.01563|-0.34375 ; 8217|2663|6395|0.1943|0.9319|-0.3063|222|0.01563|-0.35938
x-border: 67 shared vertices, 7 mismatched (apron 10)
z-border: 37 shared vertices, 0 mismatched (apron 10)
x-border, z=1: 56 shared vertices, 0 mismatched (apron 10)
[What the mismatches are: slot data is chosen per quad, and border-corner vertices are duplicated per quad. Each chunk's copies at a border corner therefore serve its own quads, which choose differently from the quads across the border. Positions, normals and AO agree in every case. The confidence-gated variant (conf 1) passed this harness test with 0 mismatches at aprons 10 and 12, but only because its choices happened to agree at this border.]
--- own tests (work/mv/apron2.mjs, work/mv/edgecont.mjs), verbatim:
apron 10 vs 16: 0 of 108592 triangles differ (28344 triangles carry fitted slots)
  step sizes (in 1/16 of an edge): {"le2":10,"le4":11,"gt4":10,"count":253}
interior edges (4 bench chunks): 36959 shared, 2104 show a material change, 284 have a boundary that steps at the edge
chunk-border edges (seams world, apron 10): 88 shared, 1 show a material change, 0 have a boundary that steps at the border
chunk-border edges (10 real-terrain chunk pairs, apron 10): 404 shared, 15 show a material change, 4 have a boundary that steps at the border
[The apron test covers the 16 bench chunks and 4 chunks of the seams.mjs world: every triangle's slot data is identical at apron 10 and 16. Continuity across chunk borders matches that across interior quad edges (about 13–27% of boundary-crossing edges step). mf-iso and hints step at 0 edges.]
```

## Timing

```
node harness/timing.mjs --n 5 approaches/hints.mjs approaches/mv-quad.mjs:
hints            mesh only, min of 5: mean 10.59 ms, median 10.90 ms, max 16.47 ms (apron 10)
mv-quad          mesh only, min of 5: mean 29.10 ms, median 27.92 ms, max 70.44 ms (apron 10)
Edit bench (work/mv/editbench.mjs: a 4×4×2 stone platform plus a 13-block painted plank diagonal at the world corner x=0, z=0, y=32; 8 dirty chunks; 52³ inputs; min of 5):
8-chunk edit (min of 5): hints total 64.2 ms (max 13.2), mv-quad total 167.0 ms (max 42.9); extra per chunk mean 12.8 ms, max 34.3 ms
```

## What it fixes

- Shallow straight material edges become exact lines. Std: 1:8 0.299 → 0.010 (mx-contour 0.048, mf-iso 0.131); 1:5 0.008; 1:3 to 1:1 0.006–0.011. On 45° rows 0.011 is the metric's own sampling floor.
- Curves: discs 0.27–0.30 → 0.047 / 0.098 / 0.102 (mx 0.113–0.173, mf 0.129–0.148), with the area kept at ×0.99–1.00.
- The owner's 1-wide diagonal line renders as one continuous straight band at the ideal width: 1:1 width 0.707 against 0.707 ideal, 1 part; 1:2 width 0.894 against 0.894, std 0.006. The 2-wide band is exact (1.414). The horizontal line's end spike from round 1 is gone (1 part).
- Deliberate shapes stay crisp: square-6 0.000, a lone block ×1.00, and checkerboards are kept as 18 crisp blocks (mx 3 parts, mf 1 merged blob).
- Three-material junction is a clean Y: 0.000 / 0.015 / 0.011 (mx 0.029, mf 0.085), using only 2 channels plus 2 other ids.
- Materials on a hinted hill: stone disc 0.063 and sand edge 0.046 (hints 0.330, mx 0.135, mf 0.142). The δ 0 setting gives 0.049 / 0.006.
- Real terrain: shorelines and grass/dirt boundaries become smooth curves, with no shards after per-quad choice. Displayed area vs block faces on the 16 bench chunks: grass ×1.00, dirt ×0.99, stone ×1.00, sand ×0.97 (mf-iso dirt ×0.89, mx-contour ×1.13). The riser bleed (dirt creeping up sand risers at the shore, dirt ×1.82 on the beach chunk) is removed by the step rule.
- Wall and cliff tops no longer bleed onto the ground at their foot, because boundaries across steps taller than 1 block are cut.
- Geometry, collision, picking and every constraint row are identical to hints.

## What it does not fix

- Surface jagginess (terraces, facets, AO bands) is untouched: the geometry is the hints mesh, and every geometry row equals hints.
- Boundaries on steep or vertical faces: the model is a plan view, and steps taller than 1 block are cut, so cliff faces keep block-edge material boundaries.
- Boundary continuity is not perfect. 13.5% of boundary-crossing quad edges show a small step (284 of 2104 on 4 bench chunks, mostly where three or more pieces meet), as do 4 of 15 such chunk-border edges. mf-iso's continuous field has 0.
- Organic terrain is re-interpreted, not just smoothed. Saddle connections turn stair-stepped dirt dashes on slopes into continuous curving bands ('rivers'), which looks different from hints. An occasional odd polygon (a bowtie) remains.
- Material-boundary anti-aliasing: the harness can't show the fwidth blend, and MSAA does not anti-alias a hard threshold.

## Failure modes

- Per-vertex slot choice shatters on real terrain. Neighbouring vertices pick different piece pairs, so triangles interpolate unrelated distances. See work/mv/v-mtn-close.png, top right. Per-quad choice with vertex duplication is required; the cost is +19.0% vertices and quad-edge steps.
- Extrapolated curves: using a fit's extended line beyond the piece's end filled a 2.5-block dirt rectangle where every column top was grass. This is fixed with the own-side default, which must not be applied to the AND/OR decision (that broke square-6).
- The riser rule trades plan accuracy for 3-D fidelity. Boundaries that cross steps bend slightly (hill-materials 0.049 → 0.063 and 0.006 → 0.046 at δ 0.5). Without it, dirt shows ×1.27 its block area.
- Cost: +18.5 ms mean and +54 ms worst per chunk on unedited terrain (JS prototype; hints 10.6 ms). The 8-chunk edit adds +12.8 ms mean and +34 ms max per chunk; the slowest chunk goes from 13 to 43 ms, so C-12's 33 ms p95 fails as is.
- Apron. Results were identical at apron 10 and 16 on 108,592 triangles. Reach analysis says 12 is needed for a guarantee: walk 3.5 + window 7 + saddle margin 2 + quad-centre offset. The unedited GEN_MESH path must grow from 38³ to 52³–56³.
- The harness seam test reports 7 mismatches at the x border. Those copies serve different quads in the two chunks, so they are not a determinism failure, but a reviewer who reads only the harness test could take them for one.
- Windows near multi-top columns (caves, overhangs) need per-level fits: 'dirty' boxes add fits.
- Heuristic thresholds (corner arms 5 steps or more, 2 periods, 60° turn, checker = 3 or more saddle neighbours, step rule ≤ 1) can misread intentional pixel patterns. Example: a 2-block-wide checker stripe.

## Production fit

- **dataPath**: A CPU pass in the mesh worker, after the hints mesh. There are no textures, storage buffers or new bindings.
1. Column tops over the region (2-D).
2. M* plus sparse per-level maps; boundary chains extracted once per map.
3. Fits per boundary linel, cached per map (393 per chunk on bench terrain).
4. For each quad within 3 blocks of a boundary (about 900 of 3050 per chunk): walk, choice, and 4 vertex evaluations.
5. Vertex duplication: +19.0% on terrain (+10.5% with the confidence gate, +5.8% with one channel).
6. Triangle index rotation, so each provoking vertex carries the quad's flat byte.
The index buffer is rewritten (rotations and duplicate indices). Pick records and quad order are unchanged. The CPU collision copy can keep the original indices, since positions are identical.
- **vertexFormat**: 16-byte vertex unchanged.
- Bytes 13–15: b0 = o1 | o2<<3 | op<<6 | valid<<7; s1 and s2 as i8 at 1/64 block (±1.98).
- Byte 12 bits 3–7 and flags bits 2–7 stay free. A 3-channel layout that uses all 35 spare bits was tested; it gave no gain.
- Vertex shader: s1, s2 as perspective-interpolated f32 varyings; b0 as a flat u32.
- Fragment: about 6 ALU ops: own = op ? min(s1,s2) > 0 : max(s1,s2) > 0; other = s1 ≤ s2 ? o1 : o2.
- Optional AA: band on the composite min/max over fwidth, with a second material fetch only inside it.
- **determinism**: Stored values use only + − × ÷ √ and comparisons, in fixed order. No exp, pow, trig or hypot (checked by grep).
- DSS recognition is pure small-integer arithmetic.
- The LP is an active-set simplex with Bland's rule.
- The analytic centre is a fixed 16 Newton steps.
- Bump weights are computed without square roots.
- Every fit is computed in coordinates relative to its pointel, and evaluated relative to the quad's corner, so no chunk-dependent absolute coordinate enters the arithmetic.
Verified: 0 of 108,592 triangles' slot data differ between apron 10 and 16, over 16 bench chunks and 4 seams-world chunks.
- **apron**: 10 is verified empirically (identical to 16). 12 is needed for a guarantee: the walk reaches 3.5 from the quad centre, the fit box is ±7, and saddle and level-choice decisions add 2.
Cost: every chunk needs the 52³–56³ region, not today's 38³ unedited one. A cheaper path is a 2-D column-top apron, since the fit needs only surface tops, or generator material hints for unedited terrain (see combinesWith).
- **cpuCost**: timing.mjs, min of 5, 16 chunks: hints 10.59 ms mean; mv-quad 29.10 ms mean, 70.44 ms max. That is +18.5 ms mean and +54 ms worst for the JS prototype.
Breakdown, measured stage by stage on an earlier near-identical variant:
- fits: 393 per chunk at about 15 µs, about 6 ms;
- per-quad walks: about 6 ms;
- choice, values and assignment: about 3 ms;
- maps and chains: about 1–2 ms.
Round 1's annotate was about 100 ms per chunk.
Edit bench, 8 chunks: +12.8 ms mean, +34.3 ms max per chunk; total 167 ms vs 64 ms for hints.
Estimate, not measured: typed-array, allocation-free production code at 2–3× faster, i.e. +6–9 ms per chunk.
- **gpuCost**: Estimated, not measured on a GPU. No new buffers. Triangles unchanged. Vertices +19% on terrain (about +10 KB per chunk; vertex shader work +19% at most). Fragment: 2 varyings, 1 flat u32, about 6 ALU ops, plus the optional AA band's second fetch. Cheaper than mx-contour's per-fragment block lookup and comparable to mf-iso.
- **physics**: Geometry is untouched. Collision and picking use identical triangle positions; duplicated vertices have identical positions, and rotated triangles keep their winding. Every constraint row equals hints (floating-block 0.60, pillar 0.40, tunnel 1.00, roof 1.90, sharp-wall 0.00). Material appearance never affects collision.
- **editability**: An edit changes fits and quad choices within about 12 blocks: window 7 + walk 3.5 + margin 2. That is inside the existing 8-chunk dirty set (k = 6, [b−9, b+10]). Painting (material-only edits) also updates smoothly.
Latency is the risk: the slowest chunk of an 8-chunk edit rises from 13 to 43 ms. To meet C-12, either:
(a) swap the edit in with the previous or block-edge material data and refine within 1–3 frames, or
(b) optimise the code (estimate above).
Sharp blocks stay crisp: sharp quads get no slots.

## Combines with

It changes only material appearance. It needs the mesh's quads, each vertex's lattice corner and final position, and the region's blocks.

- AO and shading (gn-best): orthogonal.
- Geometry rules (gs, gh): compatible as long as the quad topology stays. The fit reads blocks only, and evaluates at the final vertex positions.
- Generator material hints (survey): the natural production split. Generated terrain gets smooth boundaries from the generator's continuous fields at apron 1. Fitting is kept where intended shapes exist, i.e. near shape or material edits, which already use the 52³ region. That removes most of the apron and cost penalty from streaming.
- mf-iso: an alternative for the same spare bits, not combinable in one vertex. Its continuous field has zero quad-edge steps but rounds squares and misses shallow lines. A hybrid would need separate data paths.
- The one-channel per-quad variant (only the 1:1 thin diagonal degrades, +5.8% vertices) leaves the 3 reserved bytes for another team's data.

## Variants tried

- **mv-fit (round 1, resumed)**: Per-vertex slots (2 nearest pieces per corner), W 10, apron 13, v1 tracing per corner and per pointel.
  - Result: Scenes already strong: 1:8 0.008, discs 0.047/0.097/0.099, square 0.000, junction 0.014, hill 0.047/0.006, lines connected. Real terrain shattered into shards and slivers. Annotate cost about 100 ms per chunk, with 1462 fits per chunk.
- **window size W / walk reach**: W 10, 7, 6, 5, 4; walk 5, 3.5, 3.
  - Result: W 7 matches W 10 (1:8 0.010). At W 5, 1:8 is 0.033 and discs 0.12. At W 4, 1:8 is 0.074 and square 0.294. Walk 3 broke square-6 (0.122) until the loop-start fix; walk 3.5 works.
- **arc fits: LP vs least squares vs none**: Least-squares ±½-target arc instead of the max-margin LP; arcs off (λ-MST only).
  - Result: LP discs 0.042–0.103. Least squares 0.15–0.18 (max 0.47). λ-MST only 0.17–0.20. Dropping the analytic centre costs little (0.054/0.099/0.099), but it is kept.
- **speed path (v2→v5, identical output)**: Chains extracted once per map; fits shared across levels via M* with a clean-box test plus the ≤1 step rule; allocation-free DSS; 4-variable active-set LP (same margin to 3e-14, 2.7× faster); allocation-light pieces.
  - Result: Slot bytes identical to v1 at W 7 (0 of 225,417 differ). Fits per chunk 1462 → 678 → 393 (walk 3.5). Fit cost 28 → 15 µs. Annotate about 100 → about 19 ms per chunk.
- **one channel vs two (the survey claim, with fitted curves)**: s2 = s1, with per-vertex sharing and then with per-quad choice.
  - Result: Per-vertex, one channel confirms the survey: line1-0deg vanishes (area ×0.000), line1-1:1 splits into 25 parts, line1-1:2 into 12, the 2-wide band scores 0.118 and square-6 0.277/0.931. Two channels keep them all exact. With per-quad choice plus duplication, one channel fails only on the 1-wide 1:1 diagonal (0.110/0.246, a sawtooth but still 1 part); everything else is identical, at +5.8% vertices.
- **confidence gating (per-vertex)**: Second channel only between lines, corners and consistent arcs.
  - Result: Removed most per-vertex terrain shards; scenes unchanged. Unnecessary once choices are per quad: dropping it gives 284 instead of 336 quad-edge steps.
- **own-side default far from piece ends**: Blend toward +2 (own side) instead of extrapolating the nearest fit's curve past a piece's end; applied to vertex values only.
  - Result: Removed spurious fills, e.g. a 2.5-block dirt rectangle where every column top was grass. Applying it to the AND/OR decision too broke square-6 (0.261).
- **own-region adjacency filter (rejected)**: Candidate pieces must bound the vertex's own 8-connected region within ±2.
  - Result: Broke thin lines (1:1 0.468, 1:2 0.403) and square-6 (0.449).
- **per-quad choice + vertex duplication (mv-v6 → mv-quad)**: Two pieces and the op chosen once per quad at its centre; a shared vertex is duplicated if values differ; the flat byte is matched by provoking-vertex rotation.
  - Result: No shards on terrain, and the end spike of line1-0deg is gone (1 part). Vertices +20.4% → +10.5% with own-safe adoption and rotation (+19.0% without confidence gating). Boundary steps at 284 of 2104 boundary-crossing quad edges (mf-iso: 0).
- **checkerboard detection**: Corners within ±2 of a checker-like saddle cluster get no pieces.
  - Result: Checker becomes 18 crisp blocks (area ×1.00) instead of a jagged ring; no effect elsewhere.
- **riser step shift δ**: 0 / per-point 0.4 / squared-mean 0.4 and 0.5.
  - Result: Terrain dirt area vs block faces: ×1.27 at δ 0, ×0.99 at 0.5 (squared). Hill-materials: 0.049/0.006 at δ 0, 0.063/0.046 at 0.5 (squared), 0.090/0.067 per-point. Kept 0.5 (squared).
- **mv-quad3: three channels in all 35 spare bits**: s1–s3 in 24 bits; oa, ob, two selectors and a 3-bit form (AND3, OR3, (a∧b)∨c, (a∨b)∧c) in 11 bits.
  - Result: Scenes identical. Quad-edge steps 334 vs 336 (with gating), and 386 without gating: no gain.
- **10-bit distances**: Quantisation 1/256 instead of 1/64.
  - Result: No gain. The 0.011 on 45° rows is the metric's 1/32-sample staircase.
- **cross-shaped op window**: AND/OR from 5 instead of 9 labels.
  - Result: No speed gain (28.7 ms); 335 steps instead of 284. Not used.

## Open questions

- Can a consensus pass, in which neighbouring quads adopt each other's piece when it crosses their shared edge, remove the 13.5% quad-edge steps without bringing back per-vertex shards?
- Is +19% vertices acceptable? The alternatives are confidence gating (+10.5%, 336 steps) and one channel per quad (+5.8%, sawtooth only on 1-wide 1:1 diagonals).
- Production cost of an optimised implementation (estimated 2–3× faster) and the C-12 strategy: asynchronous material refinement after edits versus a faster pass.
- Should unedited terrain get generator material hints instead of fits? That avoids growing the streaming region from 38³ to 52³–56³ and most of the CPU cost.
- Owner taste: continuous dirt 'rivers' where saddle connections join stair-stepped dashes (the 1-wide diagonal rule applied to terrain), versus mf-iso's blobs or hints' dashes. Also, are checkerboards kept as blocks acceptable?
- Steep faces: a second plan map per dominant axis (x- and z-facing) could fit boundaries on cliffs, which today keep block edges.
- The riser step rule: δ 0.5 gives exact area balance but bends boundaries that cross steps. Is a slope-aware δ worth it?

## Harness issues reported

- harness/seams.mjs compares per-vertex records per corner key. Approaches that choose data per quad and duplicate vertices legitimately differ there, because each chunk's copies serve its own quads. It needs a quad-aware criterion: (a) per-triangle data identical at the claimed apron and a larger one, and (b) boundary continuity across border edges vs interior edges. Both are in work/mv/apron2.mjs and work/mv/edgecont.mjs. Also, the seams world has only 1–3 material-changing border edges, which is weak coverage; edgecont.mjs adds 10 real-terrain chunk pairs.
- The fragment contract does not receive the mesh. Flat per-mesh data (b0) has to travel through a module-level 'current mesh' variable, which breaks if a tool calls mesh() twice before rendering. Suggest passing the mesh in info.
- Geometry 'pos' statistics count each distinct vertex index once, so duplicated vertices are counted twice. mound and pit position std therefore differ slightly from hints although the geometry is identical; shading and face rows are unaffected.
- A 45° boundary whose phase is not aligned with the sample grid scores std 0.011 from the 1/32-sample staircase alone (edge-1:1, line1-1:1, line2-1:1). Aligned approaches score 0.000, so 0.011 vs 0.000 is not a quality difference.
- timing.mjs times mesh() only. mx-contour does its reconstruction lazily inside fragment() (a cache), so its 11.2 ms excludes its main CPU work. Cross-team cost comparisons from timing.mjs can mislead.
- There is no edit-latency bench in the harness. I wrote work/mv/editbench.mjs: 8 chunks around a world corner, a shape edit and a painted line, min-of-N interleaved with hints.
- There is no real-terrain material-balance or continuity metric. I used work/mf/areas.mjs, plus work/mv/areas2.mjs (split by slope) and work/mv/edgecont.mjs; plan-view sheets of terrain come from work/mv/terrplan.mjs.

## Images (in the original run; not kept in this folder)

- work/mv/final-mtn-close.png
- work/mv/final-mtn-plan.png
- work/mv/final-beach-plan.png
- work/mv/final-channels.png
- out/mv-quad/img/line1-1:1-view.png
- out/mv-quad/img/junction3-plan.png
- out/mv-quad/img/hill-materials-view.png
- out/mv-quad/img/terrain-mountain-view.png
