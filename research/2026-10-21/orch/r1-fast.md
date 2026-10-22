# TEAM fast

I couldn't write REPORT.md: the harness refuses report .md files from subagents. This result is the report. Everything else is saved and backed up: scripts in src/, numbers in res/ and logs/, 58 images in img/, 4 contact sheets in sheets/, and a reference cache in refcache/.

What I did:
- Checked the engine's first MBO step against an analytic sum of per-block kernels.
- Ran the physics references FID-0.15, FINITE-4 and FINITE-2 on all 36 catalogue configurations, plus FREE on 7 small ones. n = 16, except n = 12 for ball-r2 and ball-AB.
- Built local one-step models on the same grids and measured surface distance, seam distance and volume error against those references.
- Turned the best model into a deterministic vertex-placement rule for surface-nets corners, using only + - * /. Timed it on generated chunks next to the repo mesher, bundled from HEAD c27fa8b.

Headline findings:
1. One MBO step from the blocks is exactly a metaball sum, to 8e-8.
2. Threshold 1/2 shrinks small clusters: one block keeps 0.665 of its volume at sigma 0.2 and vanishes only above sigma 0.40. Restoring volume with a per-material shift (lambda) gives a mean surface distance to FID-0.15 of 0.018 blocks. A purely local lambda rule (count of same-material blocks in the 3x3x3) gives 0.019, with 1.6 % mean volume error.
3. T engine steps behave like one step at sigma*sqrt(T); the evidence is T = 2 and T = 4.
4. Compact polynomial kernels cost almost no accuracy. With the box*tent kernel at sigma 0.2, a corner's vertex depends only on its 8 blocks (plus n27 for lambda).
5. The vertex rule costs about 2–8 ms per chunk, against 4–25 ms for the whole repo mesher on the same 38^3 inputs. It is seam-exact, but plain Newton fails to converge at 0.4 % of corners.

Main caveat: one vertex per lattice corner cannot hold 'flat face plus rounded edge'. Placing vertices on the physical surface (0.032 from it, against 0.15 for cubes) drags the flat quads inward, so against FID plain cubes give the smaller mesh error (0.034 against 0.113). The rule only wins on large or strongly rounded shapes.

Feature checks:
- Survive in the cheap model: seamless union, groove depth at material seams, and short-time junction angles.
- Lost or changed: FID's concave fill, which needs about 10 iterations; diagonal union in the mesh (topology keeps it pinched); and the physics' wall between diagonal different-material blocks.
- The physics itself closes the 1x2 tunnel to 1.21–1.43 blocks high, and the vertex rule gives 1.73. Both are below the required 1.90, so the existing §7.4 constraint box would have to apply after the rule.

- [C1] (physics, measured) One MBO step from the blocks is a metaball model. In the engine's first step, each cluster's blurred indicator P.u equals the sum over its blocks of the separable kernel built from the engine's discrete Gaussian, to float32 precision. It differs from the continuum erf kernel k(t) = (erf((t+1/2)/(sqrt2 sigma)) - erf((t-1/2)/(sqrt2 sigma)))/2, sigma = s/n = 0.2, only by discretisation.
  numbers: 10 configurations, up to 1.09 M cells. Engine against discrete kernel in f64: max 8.1e-8. Engine against erf continuum: max 0.0044, rms at most 0.0010. Step-1 labels rebuilt from the analytic fields with the engine's lambdas differ only where the two best costs are within 0.0029 (0–96 cells; 5,292 of 143,712 in slab-line; 9,496 of 304,724 in terrain-step).
  refuteBy: Run t1.mjs on any configuration at n = 16, s = 3.2 and find max |P.u - discrete sum| > 1e-6, or max |P.u - erf sum| > 0.01.
  evidence: teams/fast/res/t1-metaball.json, teams/fast/logs/t1-metaball.log, teams/fast/src/t1.mjs

- [C2] (limitation, partly-measured) In the engine's per-step volume solve, large flat clusters settle on lambda = 0.12479. That value puts the threshold exactly on the first outside sub-cell layer of a flat face, so whole face layers become near-ties. This is a numerical property of the cell-quantile volume solve, not physics.
  numbers: lambda = 0.12479 for slab-line's B clusters and all three terrain-step clusters at step 1. The outside-cell value of u at a face is about 0.4378, and (1 - 0.12479)/2 = 0.4376 (inference). The label mismatches cluster there.
  refuteBy: Print the step-1 margins per cell for terrain-step and show that the mismatching cells are not in the first sub-cell layer outside flat faces, or that lambda does not jump in steps when the flat-face area changes.
  evidence: teams/fast/res/t1-metaball.json

- [C3] (physics, measured) One blur of the blocks thresholded at 1/2 (lambda 0) shrinks small clusters and makes single blocks vanish only above sigma about 0.40. At the engine's sigma 0.2 a single block keeps two thirds of its volume.
  numbers: Fraction of volume kept at sigma 0.2: single 0.665, pair 0.764, line of 3 0.796, 2x2 0.848, 2x2x2 0.907, ball r 2.2 0.948. At sigma 0.40: single 0, pair 0.17, 2x2x2 0.66. Analytic vanishing sigma 0.3956.
  refuteBy: Compute the {2u > 1} volume of one block's erf-kernel field at sigma 0.2 on a fine grid and get a fraction outside 0.64–0.69, or find the block still present at sigma 0.41.
  evidence: teams/fast/res/t2a-shrink.json, teams/fast/logs/t2a-shrink.log

- [C4] (optimization, measured) A one-step metaball model with volume restored by one lambda per material reproduces the FID-0.15 physics surface to a mean distance of about 0.02 blocks over the 36-configuration catalogue. Restoring volume is what matters: lambda 0 is 3.5 times worse.
  numbers: Surface mean / mean p95 / worst p95, with mean and worst |volume error|:
- Bx-g20: 0.0180 / 0.056 / 0.203; volume 0.000 / 0.003
- A0-g20: 0.0622 / 0.112 / 0.259; volume 0.185 / 0.338
- Bc15-g20: 0.0278; volume 0.067 / 0.166
Seam mean 0.006–0.009.
  refuteBy: Re-run refs.mjs FID-0.15 and t2.mjs with Bx-g20 on the catalogue (250 lines, seed 7), or with another line seed, and get a surface mean above 0.03.
  evidence: teams/fast/res/t2-FID.json, teams/fast/logs/summ-t2-FID.log

- [C5] (pattern, partly-measured) T engine steps from the blocks (FINITE-T) are approximated by a single volume-kept step at sigma about 0.2*sqrt(T).
  numbers: Surface mean against FINITE-4, by one-step sigma: 0.30 → 0.0244, 0.35 → 0.0141, 0.40 → 0.0101 (best), 0.45 → 0.0184, 0.50 → 0.0317.
Against FINITE-2: 0.20 → 0.0255, 0.25 → 0.0144, 0.30 → 0.0072 (best tested), 0.35 → 0.0137.
Code check: 4 iterated steps reproduce FINITE-4 to 0.0067.
  refuteBy: Run FINITE-8 references and find the best one-step sigma outside 0.5–0.65, or find that FINITE-2's optimum is clearly above 0.32 after a finer sigma grid.
  evidence: teams/fast/logs/summ-t2-FINITE4.log, teams/fast/logs/summ-t2-FINITE2.log, teams/fast/res/t2-FINITE4.json, teams/fast/res/t2-FINITE2.json

- [C6] (optimization, measured) The volume shift can be estimated locally. Each block gets lambda_b = a + b((27 - n27_b)/26)^4, where n27_b is the count of same-material blocks in its 3x3x3; the values are blended by the same kernel. At sigma 0.2 this keeps volume to about 2 % and gives nearly the oracle's surface accuracy, including on held-out larger configurations. At sigma 0.4 it does not.
  numbers: Fit: a = 0.0498, b = 0.1883, rmse 0.022 over 65 per-material lambdas in the range 0.071–0.271.
Bl-g20 against FID: surface mean 0.0192, volume error mean 1.6 %, worst 8.2 %.
Holdout (fitted on configurations of at most 12 blocks, tested on the 7 larger ones): volume 2.4 % mean, 5.2 % worst; surface 0.0266 against 0.0258 for the exact oracle.
Bl-g40 against FINITE-4: volume 8.6 % mean, 50 % worst.
  refuteBy: Apply the g20 rule to generated terrain or new configurations (overhangs, thin walls, mixed slabs) and find volume errors above 10 % for clusters of more than 12 blocks.
  evidence: teams/fast/res/fitlam-g20.json, teams/fast/res/fitlam-g20-small.json, teams/fast/logs/holdout-summary.log, teams/fast/logs/summ-t2-FID.log, teams/fast/logs/summ-t2-FINITE4.log

- [C7] (limitation, measured) The concave fillets of FID-0.15 come from iterating to its fixed point. One step does not reproduce them; repeated fidelity steps converge toward them.
  numbers: Same 10 configurations, surface mean / mean p95: 2 steps 0.0266 / 0.107; 4 steps 0.0222 / 0.084; 10 steps 0.0166 / 0.053; one step (Bx-g20) 0.0246 / 0.098. On stairs alone, p95 goes 0.145 → 0.048 from 2 to 10 steps. The FID references took 8–41 steps.
  refuteBy: Find a one-step local model whose p95 against FID on stairs, tunnel and ring8 is at most 0.06.
  evidence: teams/fast/logs/summ-t2-FID-iter.log, teams/fast/logs/iter-subset-compare.log, teams/fast/res/t2-FID-iter.json, teams/fast/sheets/fid-iterations-stairs.png

- [C8] (optimization, partly-measured) Compact piecewise-polynomial kernels (box convolved with a B-spline of the same variance) replace the erf kernel at almost no cost in accuracy. With the box*tent kernel at sigma <= 0.204, the field inside a lattice corner's cell depends only on that corner's 8 blocks: it is trilinear interpolation of the 8 occupancies in coordinates warped by the quadratic smoothstep w(s) over [-h, h], h = sigma*sqrt6.
  numbers: Against FID with local lambda, surface mean: Gaussian 0.0192, b3 0.0201, b2 0.0206, b1 0.0208. Against FINITE-4 with exact lambda: Gaussian 0.0101, b3 0.0111.
b1 support at sigma 0.2 is 0.990 blocks (computed). The 8-block property follows from support < 1 (derivation).
  refuteBy: Evaluate the b1 field at points inside a corner cell with and without blocks outside the 2x2x2 and find any difference at sigma 0.2; or find a configuration where b1's surface mean against FID exceeds the Gaussian's by more than 0.01.
  evidence: teams/fast/logs/summ-t2-FID.log, teams/fast/logs/summ-t2-FINITE4.log, teams/fast/src/kern.mjs, teams/fast/src/vrule.mjs

- [C9] (optimization, measured) The one-step model as a surface-nets vertex rule (b1 kernel, local lambda, 4 Newton steps, quantised to 1/256) costs about the same per chunk as the repo mesher's vertex work. It needs an apron of 2, so it fits the 38³ region. With a constant lambda, single-material corners reduce to a 256-entry table.
  numbers: Minimum time per chunk, two runs on a loaded machine:
- bub-b1 local: 2.1–3.2 ms on surface chunks (1.3k–2.5k corners), 5.6–7.8 ms on mixed and cave chunks (6.2k–8.5k corners), with one outlier at 11.4.
- b3 (64 blocks): 7–52 ms.
- Table floor (scanning 33³ corners): 0.7–1.5 ms.
- Repo mesher, whole mesh, same inputs: 4.1–24.5 ms.
- Multi-material corners per chunk: 0–900.
- Physics engine step at 1.09 M cells: 427 ms (t1 log).
  refuteBy: Time bubbleVertices (b1, local lambda) on the same chunks in a quiet Node session and get more than 10 ms on the cave chunks, or show that shared corners differ when the apron is 2.
  evidence: teams/fast/logs/summ-t3time.log, teams/fast/res/t3time-run2.json, teams/fast/res/t3time-run3.json, teams/fast/src/t3time.mjs

- [C10] (engine, measured) The vertex rule gives identical offsets on both sides of a chunk seam because it reads only blocks within the 38³ region. Plain Newton does not converge at a small set of corners, mostly two-material corners with 7 solid blocks. A safeguarded line search along the corner gradient always converges, at about 2.5 times the cost.
  numbers: Seams: 558 shared corners over 5 chunk pairs, 0 mismatches, for b1 and b3; same machine and JS engine only.
Newton: 4 against 16 iterations differ by more than 1/256 at 65 of 17,284 corners, max 0.96 block. 51 of those are 7-solid two-material corners.
Line search: 14 against 40 bisections, 0 corners differ by more than 1/256. Cost 13–19 ms on cave chunks.
  refuteBy: Find a shared corner with different offsets in two adjacent chunks, or a corner where the line solver at 14 bisections differs from 40 by more than 1/256.
  evidence: teams/fast/res/t3seam.json, teams/fast/res/t3newton.json, teams/fast/logs/t3newton-bad.log, teams/fast/logs/t3line-converge.log, teams/fast/res/t3line-bisect.json

- [C11] (limitation, measured) With one vertex per lattice corner, putting vertices on the physical surface does not minimise mesh error. Against FID-0.15, plain cube corners give the smallest quad-surface error, because flat quads between on-surface vertices cut through flat faces that have rounded edges. On-surface vertices win only for large or strongly rounded shapes.
  numbers: Mean distance over 36 configurations, vertex / quad patch:
- Against FID-0.15: bub-b1 0.032 / 0.113; cube 0.150 / 0.034; bevel 0.187 / 0.230; hints (binary placed blocks) 0.294 / 0.329.
- Against FINITE-4: bub-b1 0.068 / 0.105; cube 0.223 / 0.078; bub-b1 with offsets x 0.5: 0.144 / 0.072.
- The 8 large configurations against FINITE-4, patch only: bub-b1 0.062, cube 0.097, bevel 0.173.
  refuteBy: Run t3acc.mjs with a finer patch sampling or another distance method and find bub-b1's patch error below the cube's against FID-0.15.
  evidence: teams/fast/logs/summ-t3acc-FID.log, teams/fast/logs/summ-t3acc-FINITE4.log, teams/fast/logs/summ-t3acc-FINITE4-big8.log, teams/fast/res/t3acc-FID.json, teams/fast/res/t3acc-FINITE4.json

- [C12] (pattern, partly-measured) Seamless union of same-material blocks and the groove at different-material seams both survive in the cheap model, with the groove's depth close to the physics. In a surface-nets mesh the groove can only be one quad wide on each side of the seam.
  numbers: pair-same dip at the joint: models 0.000; references -0.002 (FID), -0.006 (FINITE-4), -0.028 (FREE), all ridges rather than grooves.
pair-diff dip: FID 0.050, FINITE-4 0.068, FREE 0.052; models 0.042–0.058.
Vertex level: the seam corner sits 0.043 lower than the same-material joint corner (0.891 against 0.934).
The groove width follows from the topology (inference).
  refuteBy: Measure the pair-diff dip on the engine's labels instead of the D field and find it outside 0.03–0.09, or find a model dip below 0.03.
  evidence: teams/fast/res/t4feat.json

- [C13] (pattern, measured) Junction geometry in the cheap model follows the short-time references, not equilibrium. A T-junction of three materials stays close to a T: about 165/97/97° at sigma 0.2 and about 151/104/104° at sigma 0.4. FREE bends it toward a Y.
  numbers: sq2-AABC seam angles at y = 0.5, measured 0.15–0.4 blocks from the junction:
- FID 175.4 / 92.3 / 92.3
- FINITE-4 152.1 / 103.9 / 103.9
- FREE 133.3 / 139.3 / 87.4
- A0-g20 166.3 / 96.8 / 96.8
- Bl-b1s20 165.4 / 97.3 / 97.3
- Bl-b3s40 150.4 / 104.8 / 104.8
- Bx-g40 152.1 / 103.9 / 103.9
  refuteBy: Measure the same angles on the engine's labels at n = 32 and find FID or FINITE-4 more than 10° away from these values.
  evidence: teams/fast/res/t4feat.json, teams/fast/sheets/features-slices.png

- [C14] (limitation, measured) Diagonal union is partly lost. Two same-material blocks touching along an edge unite in every physics regime. They unite in the one-step field only when lambda > 0, and then through a thinner neck. They can never unite in the surface-nets mesh, because its topology keeps diagonal contacts pinched. Between different materials, the physics presses the blocks into a shared wall that the sigma-0.2 model barely forms.
  numbers: diag-edge neck width at the shared edge: FID 0.74, FINITE-4 0.90, FREE 1.50, Bl-b1s20 0.36, Bx-g40 0.82, A0 0 (D = -0.024).
diag-edge-diff wall: FID 0.38, FINITE-4 0.62, FREE 1.18, Bl-b1s20 0.056, Bl-b3s40 0.37.
slab-line edge contacts that are solid and A-owned: FID 4/5, FINITE-4 5/5, models with lambda > 0 5/5, A0 0/5.
  refuteBy: Find the diag-edge neck below 0.3 in any physics reference, or a lambda-0 one-step model with D > 0 at the shared edge.
  evidence: teams/fast/res/t4feat.json, teams/fast/sheets/features-slices.png, teams/fast/sheets/models-vs-physics-2.png

- [C15] (limitation, measured) The bubble physics closes 1x2 tunnels below the game's 1.90 clearance. The sigma-0.2 one-step field keeps the tunnel, but the b1 vertex rule alone lowers the clearance to 1.73, so the §7.4 constraint box would still have to apply after it. Floating-block and pillar minimums pass comfortably.
  numbers: Tunnel clear width x height at mid-section: FID 0.98 x 1.21; FINITE-4 0.85 x 1.43; Bl-b1s20 field 0.97 x 1.97; Bl-b3s40 field 0.81 x 1.47.
Vertex rules: bub-b1 height between edge corners 1.73, width 0.95 at the wall middle and 0.73 at the floor edge; bevel 1.90 / 1.00 / 0.70.
Single block, corner-to-corner extent: bub-b1 1.30, bevel 1.04. Pillar width: bub-b1 0.86, bevel 0.50.
  refuteBy: Measure FID-0.15's tunnel height on the engine's labels and find it at least 1.90, or find b1 tunnel corner vertices giving at least 1.90 without caps.
  evidence: teams/fast/res/t4feat.json, teams/fast/sheets/features-slices.png

## optimizations
- Replace the multi-step physics with one blur of the blocks: a separable sum of per-block kernels with per-material sums and the engine's least-psi rule, plus a volume shift lambda. For shape-keeping use sigma 0.2. For a T-step relaxation look use sigma 0.2*sqrt(T).
  basis: ['teams/fast/logs/summ-t2-FID.log', 'teams/fast/logs/summ-t2-FINITE4.log', 'teams/fast/res/t1-metaball.json']; gain: Surface within 0.018–0.021 mean of FID-0.15, and within 0.010 of FINITE-4 at sigma 0.4. No iteration, no global solve if the local lambda is used. An engine step costs 427 ms at 1.09 M cells; the model is a few kernel evaluations per point.; risks: No concave fill (FID's fixed point), so worst p95 is 0.13–0.20 on concave shapes. The local lambda fails at sigma 0.4 (50 % worst volume error). Fitted on the 36-configuration catalogue only.
- Use the box*tent (b1) kernel at sigma 0.2 as a surface-nets vertex rule. Inside each corner's cell the field is warped trilinear interpolation of its 8 blocks, plus a local lambda from n27, so only + - * / are needed and the apron is 2.
  basis: ['teams/fast/src/vrule.mjs', 'teams/fast/logs/summ-t3time.log', 'teams/fast/res/t3seam.json']; gain: 2–8 ms per 38³ chunk in Node, compared with 4–25 ms for the whole repo mesher. Seam-exact (0 of 558 shared corners differ). Vertices sit 0.032 mean from the FID surface, against 0.187 for bevel.; risks: Flat quads between on-surface vertices give a larger patch error than plain cubes against FID (0.113 against 0.034). Newton fails to converge at 0.4 % of corners; the line solver fixes that at about 2.5x the cost. Tunnel height drops to 1.73, so the §7.4 constraint box is still needed.
- Precompute the vertex offsets as tables. With a constant lambda: 256 entries for single-material corners, and a material-partition table of at most Bell(9) = 21,147 patterns (about 63 KB as int8) for mixed corners. The tables can be built offline with the robust line solver.
  basis: ['teams/fast/res/t3time-run3.json']; gain: 0.7–1.5 ms per chunk (measured scan-plus-lookup floor). Removes the convergence problem from runtime.; risks: A constant lambda gives 4–7 % mean volume error on the catalogue (Bc12/Bc15 rows). The partition table is inferred, not built or timed; multi-material corners are up to 900 per surface chunk.
- Scale the vertex offsets (alpha about 0.5) to trade vertex accuracy for quad-surface accuracy on strongly rounded targets.
  basis: ['teams/fast/logs/summ-t3acc-FINITE4.log']; gain: Against FINITE-4, patch error 0.072, against 0.078 for cubes and 0.105 for unscaled offsets.; risks: Only three alpha values were tried. A per-mask optimised table might do better. Against FID, cubes still win.
## open
- REPORT.md was not written. The harness refused report .md files from subagents, so this structured result is the report. Could the orchestrator write REPORT.md from it, or allow the file?
- Which vertex placement minimises the quad-patch error rather than the vertex error? A per-mask table fitted to the physics might beat both cubes and on-surface vertices.
- Which physics regime should the game target? FID-0.15 keeps block shapes but closes 1x2 tunnels to 1.21 high; FINITE-4 rounds strongly. sigma in the cheap model is the dial (sigma*sqrt(T)). This is the owner's look decision.
- Can a local term reproduce FID's concave fill, for example the max of two one-step fields at different sigma? Not tried.
- Cross-browser determinism of the vertex rule was not tested; only same-engine seams were. The lambda table and b1 constants would need to be frozen as rationals.
- Timing ran on a machine shared with other runs, with up to 50 % spread between runs. The repo mesher itself measured 14–25 ms on heavy cave chunks here. Production timing belongs in the repo's own profile test.
- The sigma*sqrt(T) scaling rests on T = 2 and T = 4 only.
- The groove depth and junction angles were measured on the engine's D field, which rounds creases by about 0.1. They should be re-measured on labels at n = 32.
## images
- teams/fast/sheets/models-vs-physics-1.png: pair-same, pair-diff, L3-ABC, sq2-checker. Columns: blocks | physics FID-0.15 | cheap Bl-b1s20 (1 step, b1 kernel, sigma 0.2, local lambda) | physics FINITE-4 | cheap Bl-b3s40 (1 step, sigma 0.4). Same camera throughout. The cheap models track their references, including the groove at seams and the seamless union.
- teams/fast/sheets/models-vs-physics-2.png: diag-edge, slab-line, stairs, terrain-step; same columns. FINITE-4 has pinning texture on terrain-step that the one-step model lacks. Bl-b3s40 makes diag-edge too small because the local lambda under-shoots at sigma 0.4.
- teams/fast/sheets/features-slices.png: Cross-sections. Tunnel (x-y cut): the physics (FID-0.15, FINITE-4) closes the 1x2 tunnel to a small hole; the sigma-0.2 cheap model keeps it. diag-edge-diff (plan): the physics forms a wall between the diagonal A and B blocks; the cheap model barely touches. sq2-AABC (plan): FREE bends the T toward a Y; FID, FINITE-4 and the cheap model keep a T.
- teams/fast/sheets/fid-iterations-stairs.png: Stairs: blocks, physics FID-0.15 (21 steps), cheap one step (Bl-b1s20), and 2, 4 and 10 local steps with the fidelity term. The concave fillet grows with iteration; one step does not reach it.
- teams/fast/img/tunnel__FID-0.15-slice.png: tunnel, physics FID-0.15, x-y cut at z = 1.5: the 1x2 tunnel closes to about 0.98 x 1.21.
- teams/fast/img/slab-line__Bl-b1s20-view.png: slab-line (painted diagonal A line in a B slab), cheap model Bl-b1s20: the A blocks join through thin necks and grooves run along the seams.
report: NOT WRITTEN: the harness refused report .md files from subagents; this structured result is the report. Intended location: teams/fast/REPORT.md