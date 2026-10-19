# Team gs: context caps + converged smoothing (round 1)

Verdict: **promising**. Best variant: `gs-mls` (approaches/gs-mls.mjs).

## How it works

Two changes to the edited-region path of the hints mesher. The patched copy is work/gs/src/core/mesh/mesher.ts, bundled to work/gs/mesher-gs.mjs. With default params it is byte-identical to lib/mesher.mjs on every scene.

(a) Context-aware D-3 caps. Inside the D-3 clearance zone a floor vertex's upward intrusion is capped at 0.05 only in two cases: an air block of its cell, or one beside it, has solid 1–2 above (headroom ≤ 2), or the cell is the foot of a wall at least 2 high (the "tall-foot" rule, which is what keeps 2-block rises unwalkable). A horizontal axis is capped at 0.15 only across a 1-wide air gap. Ceilings keep the D-3 downward cap. Lifting the caps exposed a §7.1 skew that the caps had been hiding: an edited block (ρ=+1) next to weakly hinted air put the crossing 0.23–0.39 into the air, so placed layers floated. Cell edges that touch an edited block therefore now cross at their midpoint. R is also dilated by one block so built shapes blend into natural ground.

(b) Windowed solve instead of convergence over the patch. Iterating to convergence over the patch was measured to be neither seam-safe nor shape-safe. Instead, each R vertex gets the exact solution of a small problem posed on a window anchored to its own lattice corner. The window holds the mesh-connected vertices with |Δcorner|² < 25, reached by a BFS that never leaves the ball. They fit a weighted ((1−r²/25)²) least-squares quadric height field in the frame of the window's mean starting normal; points facing away (n·N < 0.3) are ignored. The vertex moves along that normal onto the fit and is clamped into its §7.4 box. Then one undamped Jacobi step (λ=1) runs inside the box. Only vertices whose final position the chunk needs are fitted: corners −2..34 for the fit, −1..33 for the step (byte-identical either way). Inputs are a pure function of the blocks within 8 of the corner, so apron 10 still suffices and seams are bit-exact.

No GPU change. Vertex format, vertex count and triangle count are unchanged. Unedited chunks take a byte-identical path (16/16 bench chunks).

## Comparison (harness compare.mjs)

| scene | cubes | hints | bevel | gs-mls | gs-ctx | gs-conv |
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
| hill-materials | 0.292 / 0.627 | 0.330 / 0.696 | 0.291 / 0.808 | 0.330 / 0.696 | 0.330 / 0.696 | 0.330 / 0.696 |
| ramp-1:1 | 45.0° / 45.0° ao 0.108 | 0.1° / 0.5° ao 0.103 | 17.0° / 18.4° ao 0.108 | 0.5° / 1.6° ao 0.107 | 0.1° / 0.4° ao 0.108 | 2.9° / 7.2° ao 0.101 |
| ramp-1:2 | 43.0° / 63.4° ao 0.075 | 5.6° / 8.7° ao 0.076 | 24.5° / 33.8° ao 0.076 | 0.4° / 1.6° ao 0.072 | 0.4° / 0.6° ao 0.072 | 1.4° / 5.2° ao 0.071 |
| ramp-1:4 | 34.2° / 76.0° ao 0.041 | 10.6° / 19.6° ao 0.041 | 22.0° / 46.3° ao 0.041 | 0.9° / 1.9° ao 0.039 | 4.0° / 5.4° ao 0.039 | 0.9° / 4.3° ao 0.039 |
| ramp-1:8 | 30.0° / 82.9° ao 0.043 | 11.5° / 26.5° ao 0.029 | 20.2° / 53.2° ao 0.043 | 6.7° / 9.3° ao 0.035 | 7.3° / 11.7° ao 0.035 | 2.0° / 7.1° ao 0.043 |
| ramp-diag-1:2.8 | 46.7° / 76.4° ao 0.070 | 8.1° / 15.8° ao 0.074 | 43.2° / 70.9° ao 0.072 | 0.6° / 2.2° ao 0.077 | 1.2° / 2.6° ao 0.077 | 0.8° / 4.0° ao 0.074 |
| mound-r6.4 | 48.4° / 83.5° ao 0.069 | 7.8° / 20.8° ao 0.075 | 34.5° / 81.4° ao 0.070 | 6.2° / 24.0° ao 0.075 | 6.5° / 23.6° ao 0.075 | 10.5° / 28.6° ao 0.075 |
| pit-r5.4 | 48.3° / 81.5° ao 0.132 | 9.4° / 32.4° ao 0.146 | 36.4° / 69.1° ao 0.132 | 8.2° / 38.0° ao 0.146 | 8.7° / 40.0° ao 0.146 | 11.7° / 44.7° ao 0.145 |
| terrace-disc | 0.291 / 0.728 | 0.219 / 0.486 | 0.206 / 0.490 | 0.149 / 0.358 | 0.157 / 0.376 | 0.251 / 0.520 |
| terrace-1:2 | 0.261 / 0.447 | 0.133 / 0.243 | 0.088 / 0.206 | 0.007 / 0.012 | 0.023 / 0.037 | 0.165 / 0.311 |
| tower-r4.6 | 0.341 / 0.616 | 0.170 / 0.338 | 0.233 / 0.478 | 0.158 / 0.379 | 0.175 / 0.439 | 0.202 / 0.449 |
| hinted-slope-1:4 | 34.2° / 76.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 16.1° / 31.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 0.0° / 0.0° ao 0.041 |
| hinted-hill | 45.7° / 87.7° ao 0.061 | 0.8° / 2.8° ao 0.065 | 34.7° / 81.1° ao 0.061 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 | 0.8° / 2.8° ao 0.065 |
| floating-block | ok 1.00 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 | ok 0.60 |
| pillar | ok 1.00 | ok 0.40 | ok 0.50 | ok 0.40 | ok 0.40 | ok 0.40 |
| tunnel-1x2 | ok 1.05 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 | ok 1.00 |
| roof-2-high | ok 2.00 | ok 1.90 | ok 2.00 | ok 1.92 | ok 1.95 | ok 2.25 |
| sharp-wall | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 | ok 0.00 |
| mesh ms (all scenes) | 690 | 765 | 706 | 1134 | 1055 | 2717 |

## Real-terrain bench

```
gs-mls: 31.2 ms mean, 128.4 ms max per chunk (apron 10); 6099 triangles, 3326 vertices per chunk
```



## What it fixes

- Built ramps up to 1:4 become planes (shading rms / max): 1:2 5.6°→0.4° (max 8.7°→1.6°), 1:3 9.2°→0.5°, 1:4 10.6°→0.9° (max 19.6°→1.9°). No-AO renders show the terraces gone.
- Diagonal built ramp: 8.1°→0.6° rms (max 15.8°→2.2°).
- Curved builds: mound 7.8°→6.2°, pit 9.4°→8.2° rms. Without AO the mound is a smooth dome where hints is lumpy and faceted; the remaining maxima (24–38°) sit at the creases where the shapes meet flat ground.
- Built outlines: terrace-1:2 0.133→0.007, terrace-disc 0.219→0.149, tower 0.170→0.158. Built 1:1 stairs lose their side sawtooth (builder's gallery render).
- A hidden §7.1 defect: placed blocks on hinted ground sat 0.23–0.39 into the air because an edited ρ=+1 met a weak air hint; the D-3 cap had been masking it. Midpoint crossings at edited edges put the placed faces back on their planes (the player now stands at exactly y=8.00 on a placed row).
- Context caps keep every clearance guarantee where it is needed: D-3 gates (1×2 tunnel, roof 2 above hinted ground at 3 phases, 1-wide gap placed|natural), placed|placed gap and a 1×2 doorway all pass. 2-block rises stay blocked (tall-foot rule).
- Unedited terrain is untouched: byte-identical to hints on all 16 bench chunks, so generated-terrain goldens are unaffected.

## What it does not fix

- Material boundaries (the owner's main point): every material scene is identical to hints. Staircase std 0.20–0.30; 1-wide diagonal lines still pinch (CP). This approach moves only edited geometry.
- Generated terrain: byte-identical to hints, so its AO stripes and stair-stepped grass/dirt and grass/sand seams in the bench views remain.
- Built slopes gentler than about 1:5: 1:5 3.0°, 1:6 4.9°, 1:8 6.7°, 1:10 6.8° rms (hints about 11°). A window with |Δc|² < 25 is shorter than the terrace period.
- Block-anchored AO (README finding 4) redraws block bands on the now-smooth built surfaces in production renders (ramp-1:4 AO roughness is still 0.039).
- The plan outline of 1-high layers seen from above (the stone|grass seam at the riser foot): terrace-disc foot-ring std 0.201 vs hints 0.238, bevel 0.196, cubes 0.286. Still a staircase.

## Failure modes

- Isolated 1-high built steps soften into swells. On hinted ground the 10–90% transition width grows from 1.25 to 3.13 blocks and the maximum slope drops from 44° to 17° (2.38 blocks and 28° without R dilation). Placed curbs, platforms and floors lose their crisp edge. That is a look change the owner has to accept, or use the sharp bit.
- The quadric fit overshoots on small mesas: a 6×6 one-high platform's centre rises to 7.11 (ideal 7.00).
- The tall-foot cap keeps the concave foot of walls 2 or more high near-square, leaving a draped 'skirt' at mound and tower bases. Removing it makes 2-block rises walkable: 4 of 24 physics checks fail.
- Converging literally is a trap. The membrane shrinks curved builds (mound 10.5°, pit 11.7°) and sinks plateaus to the box limit (platform 7.0→6.5; the player stands 0.5 low). Membrane and thin plate are both non-local: chunks differ from a larger apron by 9–552 vertices and seams mismatch.
- Edit-path cost: the windowed fit adds up to +7.8 ms per edited 52³ chunk (dense built surface) on the floor CPU, which bites into C-12's 33 ms edit budget when a corner edit dirties 8 chunks.
- Context tightness tests are axis-aligned (1-wide gap along x or z; headroom ≤ 2 in the column or beside it). Diagonal or irregular tight passages are untested; D-3 covered them conservatively.
- The ring pass and the Jacobi post-step fight each other on terrace outlines, so outline smoothing of 1-high layers is limited (foot-ring std 0.18–0.20).

## Production fit

- **dataPath**: CPU only, in the existing mesh worker (GEN_MESH and REMESH). Pass 1 of src/core/mesh/mesher.ts gains the context cap tests, midpoint crossings at edited edges and the dilated R. Pass 3 replaces k=6 Jacobi with the windowed fit plus one Jacobi step. Nothing new reaches the GPU: no per-quad buffers, textures or attributes; positions and normals go through the existing 16-byte vertex. Collision and picking use the same CPU positions as today.
- **vertexFormat**: Unchanged: 16 bytes, none of the 3 reserved bytes used. Vertex and triangle counts are unchanged because the topology is untouched (bench: 6099 triangles, 3326 vertices per chunk, same as hints).
- **determinism**: f64 with a fixed visiting order: BFS by the −x,+x,−y,+y,−z,+z neighbour slots, and window weights from integer lattice distances. Only + − × ÷ √ and comparisons; 6×6 Gaussian elimination with partial pivoting; quantised to 1/256 as today. Unedited chunks are byte-identical to today (16/16 bench chunks), so generator and mesh goldens for generated terrain stand. Edited-region goldens change and must be re-emitted (allowed until D-24). performance.now in the study stats must be stripped.
- **apron**: 10, unchanged; 3 still suffices with no edit in reach because that path is byte-identical. Derivation: window axis reach 4 (|Δc|² < 25), +1 for the starting-normal ring, +2 for the d₀/box/cap reads (same as D-3), +1 for the post step, measured past the boundary corner's 1-ring at 33: block 41 ≤ 31+A, so A ≥ 10. The dirty set stays at most 8 chunks. Verified: four chunks of a world with a mound on the chunk corner, ramps and a random built field along both seams are byte-identical at apron 8, 9 and 10 against apron 24, with 0 position and 0 normal mismatches on 110 shared seam vertices. The same test flags k=6 at apron 4 (47–147 vertices differ per chunk) and the converged membrane at apron 16 (32–552).
- **cpuCost**: Floor CPU (this machine is an i7-1255U), interleaved minimum of 21 runs on 52³ edited regions. Context caps alone: +0.6–2.6 ms. gs-mls: hints 5.8→13.6 ms on a whole chunk of built surface, 5.9→10.8 ms on ramp-1:4, 5.2→8.0 ms on the mound, about 4.7 µs per fitted vertex. All 36 harness scenes: hints 220 ms, gs-ctx 237 ms, gs-mls 257 ms (+17%). Zero cost on chunks with no edit in reach. The bench line (31.2 ms) is load noise: back-to-back runs of hints and gs-mls swap order between 41 and 51 ms on byte-identical work.
- **gpuCost**: None. No shader change, same vertex and triangle counts, smooth normals as today.
- **physics**: 24/24 checks with the real §9.3 controller against the patched mesher. Built 1-block rises are walkable (binary ground and hinted ground at 3 phases). 2-block rises stay blocked (binary, hinted ×3 sprinting, a 1-step then 2-high riser sprinting; minimum riser slope 61° against the 50° limit), but only because of the tall-foot cap: without it 4 checks fail. D-3 gates pass (1×2 tunnel, roof at 3 hint phases, 1-wide gap placed|natural), as do a placed|placed gap and a 1×2 doorway. The sharp wall blocks and a jump clears it. Built 1:1, 1:2 and 1:4 staircases are walkable with zero idle drift. Built 1-high steps become gentler slopes (17–28°).
- **editability**: Picking is unchanged: every vertex stays in its cell and quads still map to block pairs. The thin-feature guard holds (pillar 0.40, floating block 0.60, tunnel 0.85 wide × 1.90 high) and sharp blocks stay pinned. The trade-off: placed 1-high layers lose crisp edges (10–90% width 1.25→3.1 blocks), so architecture that should stay crisp needs the sharp bit or rDilate 0.

## Combines with

It is orthogonal to anything acting on material seams (fragment or attribute approaches) and on generated terrain, because it touches only edited geometry and is byte-identical elsewhere. It most needs an AO fix: AO computed at the moved vertex position or from the smoothed surface rather than the lattice corner. Without that, production renders redraw block bands on the now-smooth built ramps and mounds; compare the gs-mls ramp-1:4 and mound renders with and without AO in work/gs/img. Part (a), context caps plus midpoint crossings at edited edges, stands alone. It is cheap (+0.6–2.6 ms), keeps apron 10 and all physics checks, and is worth taking even without the windowed fit. It should not be stacked with the bevel rule, which replaces the same positions.

## Variants tried

- **gs-ctx**: (a) only: context-aware caps + midpoint crossings at edited edges + R dilated by 1; the §7.3 k=6 Jacobi is unchanged
  - Result: ramp-1:2 5.6°→0.4°, ramp-1:4 10.6°→4.0°, diagonal ramp 8.1°→1.2°, mound 7.8°→6.5° (visibly smooth without AO), terrace-1:2 0.133→0.023; physics 24/24; costs +0.6–2.6 ms per edited chunk. Caps were the binding constraint.
- **mls5q-d3 (explore)**: windowed quadric fit but with the D-3 caps unchanged
  - Result: ramp-1:2 8.3°, ramp-1:4 10.0°, ramp-1:8 12.1°: no better than hints. With D-3 caps no smoother can flatten built ramps.
- **ctx k=30 (explore)**: context caps + 30 fixed Jacobi iterations
  - Result: ramp-1:4 1.6°, ramp-1:8 3.4°, but mound 9.9° and pit 10.9° (Laplacian shrinkage); needs apron k+4 = 34 (100³ region).
- **gs-conv (oracle)**: context caps + today's membrane Jacobi iterated to convergence (tol 1e-5; 200–8000 iterations)
  - Result: Ramps flat up to 1:8 (2.0°), but mound 10.5° and pit 11.7° (worse than hints); a 6×6 one-high platform sinks to its box limit (centre 7.0→6.5) and the player stands 0.5 low on placed rises (physics 20/24). NOT seam-safe: at apron 16, 32–552 vertices per chunk differ from apron 30; seam mismatches at apron 10 are 14 positions + 19 normals; the iteration count itself depends on the apron (271 vs 590).
- **fid μ=0.05 (explore)**: converged membrane + fidelity to the starting offsets
  - Result: Mound still 10.0°: weak fidelity does not stop shrinkage.
- **gs-tp (oracle)**: converged box-constrained thin plate (umbrella²) with fidelity μ=0.01, FISTA, 1000–2000 iterations
  - Result: Mound 6.1°, pit 8.2°, ramp-1:8 4.6°, ramp-1:4 1.5°; NOT bit-exact: at apron 16, 9–36 vertices per chunk differ from apron 30, with 1+6 seam mismatches.
- **MLS plane (degree 1, r=5)**: windowed plane fit instead of quadric
  - Result: ramp-1:8 5.0° but mound 13.0° and pit 15.1°: plane fits shrink curved builds.
- **MLS quadric r=4, 6, 7, 8, 10**: window radius sweep
  - Result: r≥7 makes the mound worse (8.3–13.2°) and helps 1:8 only to 4.7–6.0°; r=4 loses 1:4 (2.8°). r=5 is the best at apron 10.
- **adaptive plane/quadric blend**: blend the two fits by the residual ratio RSS_quad/RSS_plane (thresholds 0.2–0.7)
  - Result: ramp-1:8 4.5° but mound 9.3° and pit 11.2°; the ratio distributions overlap (1:8 ≥0.33, median 0.70; mound median 0.26).
- **ring pass**: step feet and rims also fit a quadratic plan curve to their same-height ring
  - Result: Terrace foot-ring (stone|grass seam seen from above) std 0.201→0.182 (0.139–0.151 without the post step); diagonal ramp worse (0.6→0.9°). Dropped.
- **post Jacobi 0/1/2/4, λ 0.5/1**: Jacobi steps after the fit
  - Result: One step with λ=1 is the best inside apron 10 (terrace-1:2 0.035→0.007, ramp-1:4 1.3→0.9°); four steps need apron 13.
- **rDilate 0 vs 1**: R undilated (§7.3) vs dilated by 1
  - Result: Dilation improves toe junctions (ramp-1:8 max 17.7°→9.3°, terrace-1:2 0.025→0.007) but softens isolated 1-high steps further (10–90% width 2.38→3.13 blocks).
- **no tall-foot**: context caps without the tall-foot upward cap
  - Result: 2-block rises become walkable: 4 of 24 physics checks fail (the player climbs to y=10). The rule is required.
- **gs-mls (best)**: (a) + windowed quadric fit r=5 + 1 Jacobi step (λ=1), cone-restricted
  - Result: ramp 1:2/1:3/1:4 at 0.4/0.5/0.9° (hints 5.6/9.2/10.6), diagonal ramp 0.6° (8.1), mound 6.2° (7.8), pit 8.2° (9.4), terrace-1:2 0.007 (0.133), terrace-disc 0.149 (0.219), tower 0.158 (0.170); all constraint scenes ok; physics 24/24; byte-identical at apron 8/9/10 vs 24; +2.8–7.8 ms per edited chunk.

## Open questions

- Should a placed 1-high layer keep a crisp edge? gs-mls turns it into a 3-block swell; rDilate 0 gives 2.4 blocks at 28°. This needs the owner's eye on the builder's gallery: work/gs/img/gs-mls-builds.png vs work/gs/img/hints-builds.png.
- Built slopes gentler than 1:5. Any fixed-reach linear smoother needs a window about one terrace period long: apron 13–17 for 1:8, and r=7–10 quadric windows did not fix it in tests. A structural rule that detects tread length (MLAA-like: a tread bounded by an up riser and a down riser is a slope) might, but was not prototyped.
- Is +7.8 ms per densely edited chunk acceptable on the C-12 edit path, given up to 8 dirty chunks per corner edit? The fit could be skipped for vertices whose window is planar, or vectorised further.
- The context tightness tests are axis-aligned; diagonal 1-wide passages are untested in the physics battery.
- Mound and pit maxima (24–38°) and the tower skirt come from the hard creases where builds meet natural ground and from the tall-foot cap. Is a softer tall-foot cap (e.g. 0.15) still unwalkable for 2-block rises? Not tested.

## Harness issues reported

- bench.mjs meshes generated terrain with no edits, so it cannot see an approach that acts only on edited terrain: gs-* is byte-identical to hints there (16/16 chunks). I measured cost with work/gs/tools/editbench.mjs and scenetime.mjs (interleaved, minimum of N).
- Timings are dominated by load from parallel teams plus P/E-core scheduling on the hybrid i7-1255U under WSL. The hints bench measured 42–51 ms in back-to-back runs (README: 22.5 ms), and the 'mesh ms (all scenes)' row compares folders timed at different moments, so it is not comparable across columns.
- The terrace-* outline metric samples only the plan curve at mid-height. It rewards flattening a 1-high step: a riser squashed to 0.2 high scores 0.007. I added step-compactness (work/gs/tools/steps.mjs) and a foot-ring seam measure (work/gs/tools/footring.mjs).
- The geometry ideals keep hard creases where shapes meet flat ground (ramp toe, mound base, pit rim), so every smoothing approach shows 20–40° maxima there. Rms is the meaningful number for those scenes.
- Production renders include block-anchored AO, which hides geometry gains. I used no-AO debug renders (work/gs/tools/noao.mjs) to judge geometry.
- There is no seam test in the harness. Mine (work/gs/tools/seams.mjs) meshes four chunks of a world that straddles the borders at apron A and at apron 24 and compares bytes and shared seam vertices. It is sensitive (flags k=6 at apron 4) but passes the production default at apron 6, below the derived bound of 10, so the derivation remains the guarantee.

## Images (in the original run; not kept in this folder)

- work/gs/img/hints-mound-r6.4-noao.png
- work/gs/img/gs-mls-mound-r6.4-noao.png
- work/gs/img/gs-conv-mound-r6.4-noao.png
- work/gs/img/hints-ramp-1:4-noao.png
- work/gs/img/gs-mls-ramp-1:4-noao.png
- out/gs-mls/img/ramp-1:2-view.png
- work/gs/img/gs-mls-terrain-beach-built-ramp.png
- out/gs-mls/img/terrain-mountain-view.png
