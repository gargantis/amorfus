# TEAM look

I swept 17 configurations: the 15 in the mission, sq2-same, and a new slab-halves with one straight A|B seam. They ran under 15 regimes (BLOCKS, FID-k ×5, FID-0.15 with g 0.5 and 1.5, CAGE-r ×3, FINITE-T ×3, FREE) on the unchanged engine at n 16. I measured rounding, seam grooves, flatness, volume, convergence, the constraint scenes and diagonal-contact union, and checked key numbers at n 12/20/24 and in 2D at n 32/64/128. No regime on the mission's list is both visibly rounder than the blocks and keeps the 1×2 tunnel's 0.70 × 1.90 opening (cell-exact on labels). FID-0.25 and FID-0.4 keep it but do not change the blocks at all (Δ ≤ 0.006); every moving regime closes it, partly or fully. The cause is the per-cluster volume constraint: volume freed by rounding convex edges goes into concavities and faces. It is non-local: attaching a bar 4 or more blocks away closes the FID-0.15 tunnel (clear height 1.17 → 0), while the same bar detached changes nothing. Turning volume off instead deletes single blocks, pillars and rings. An engine copy (src/mbo-look.mjs, beyond the mission's list) keeps volume and fidelity, bounds the solid/air surface with a PLAN §7.4-style box (0.125 horizontal, 0 vertical, eroded core 0.25), and lets paint move almost freely (kMat 0.02). That gives two candidates, BOX0-PAINT-0.1-0.02 and BOX0-PAINT-0.15-0.02. Both pass every constraint scene, are visibly rounded, and turn the owner's hard case (a painted 1-wide diagonal) into one straight band while flat ground stays exactly flat. In anchored regimes, seams between materials stay colour, not grooves: Neumann's angles appear only in free or caged runs at fine resolution (2D double bubble 90.6° / 107.1° / 116.9° at n 32/64/128 against 120°). On union: diagonal edge contacts in air unite in every moving regime, corner-only contacts never do, and painted diagonals end connected only where the paint can move. The harness refused to write REPORT.md, so the full report is this structured result. The evidence is in results/*.json, results/table-*.md, results/union-table.md, logs/ and sheets/ under the team folder.

- [L1] (limitation, measured) No regime on the mission's list is both visibly rounded and keeps the 1×2 tunnel clearance. Cell-exact clear height at width 0.70 on the labels (n 16, cuts z = 0.75 / 1.5 / 2.25) passes only in BLOCKS and FID-0.4 (2.000), whose shape change is ≤ 0.002. FID-0.25 gives 1.875 (fails by one sub-cell at n 16, exactly 1.900 at n 20) with Δ mean 0.005, i.e. it looks like the blocks. Every moving regime fails.
  numbers: Clear height at width 0.70: FID-0.15 1.125/1.000/1.250; CAGE-0.15 1.75; FINITE-2 1.5; FINITE-4 1.0; FID-0.1, FID-0.05, CAGE-0.25, CAGE-0.4, FINITE-8 and FREE 0. FID-0.25 1.875 (n 16), 1.900 (n 20).
  refuteBy: Run any listed regime whose Δ mean exceeds 0.02 on the tunnel scene (src/sweep.mjs <REGIME> tunnel) at n 16 or n 20. If it gives cell-exact clearCells height ≥ 1.90 at width 0.70 at all three cuts, this is refuted.
  evidence: teams/look/results/table-tunnel-cells.md, teams/look/results/table-main.md, teams/look/results/FID-0.25@n20.json

- [L2] (physics, measured) In volume-preserving regimes the shape is non-local within a cluster. A 6×4×3 stone host has a 1×2 tunnel at x = 1; a 1×1×4 bar is attached at the far side x = 6, at least 4 blocks from the tunnel (n 12). With the bar attached, the FID-0.15 tunnel closes and the FINITE-4 tunnel narrows. The same bar detached by a 1-block gap (a separate cluster) changes 0 sub-cells of the host.
  numbers: FID-0.15: clear height 1.167 → 0, λ 0.0422 → 0.061, host volume changed 4.26 block³ (3.99 of it ≥ 2.5 blocks from the attachment). FINITE-4: 0.50 → 0.33, λ 0.0296 → 0.0409. Detached: 0 cells changed in every regime.
  refuteBy: Rerun WIDE=1 node src/nonlocal.mjs FID-0.15 (or at n 16 with a host up to 1.2 M cells). If the attached-bar tunnel matches the alone tunnel within one sub-cell, or a detached bar also changes it, this is refuted.
  evidence: teams/look/results/nonlocal-wide-n12.json, teams/look/results/nonlocal-WIDE-cands.json, teams/look/results/nonlocal-far.json, teams/look/sheets/nonlocal.png

- [L3] (limitation, measured) Dropping the volume constraint does not fix the problem: isolated features vanish. NV-FID-0.15 removes a single block, the 1×3 pillar, ring8, slab-dot and slab-line completely (Δ = 1.000). With the eroded core forced solid (BOX-NV-FID-0.15), a single block shrinks to its 0.5-wide core (Δ 0.875, extent 0.500).
  numbers: NV-FID-0.15: Δ single / pillar3 / ring8 / slab-dot = 1.000. BOX-NV-FID-0.15: single extent (labels) 0.500, Δ 0.875.
  refuteBy: Run NV-FID-k for k in 0.15–0.4 on single and pillar3. A k at which the block keeps extent ≥ 0.9 while cube2-same corners still round (corner Req > 0.15) would refute the claim that volume-off cannot give the look.
  evidence: teams/look/results/NV-FID-0.15.json, teams/look/results/BOX-NV-FID-0.15.json, teams/look/results/table-variants.md

- [L4] (look, measured) Two candidate regimes from the engine copy (beyond the mission's list) pass every constraint scene and are visibly rounded: BOX0-PAINT-0.1-0.02 and BOX0-PAINT-0.15-0.02. Both keep volume, use fidelity k 0.1 or 0.15 for solid↔air and kMat 0.02 for paint, and box the surface: growth into air at most 0.125 horizontally and 0 vertically; blocks eroded by 0.25 stay solid.
  numbers: Tunnel clear 2.000 × 0.750 (cell-exact, three cuts). Flat ground, slab tops and stair treads: max |dy| 0.000. Single-block extent ≥ 1.0; pillar width 1.0 / 1.125 and height 3.0. cube2-same corner Req (labels) 0.40 (k 0.1) / 0.34 (k 0.15), against 0.04 for blocks. Render-field edge R 0.44 / 0.53, against 0.20 for blocks. Δ mean 0.080 / 0.047. All at n 16, where the box is quantised to 0.125 / 0.
  refuteBy: Run the two regimes over the catalogue at n 20 with the exact PLAN caps (outH 0.15, outV 0.05). Any constraint failure (tunnel clearCells < 1.90 × 0.70, flat |dy| > 0.05, single extent < 0.40, pillar width < 0.40), or corner Req ≤ 0.1, refutes it.
  evidence: teams/look/results/BOX0-PAINT-0.1-0.02.json, teams/look/results/BOX0-PAINT-0.15-0.02.json, teams/look/results/table-variants.md, teams/look/results/table-tunnel-cells.md, teams/look/src/mbo-look.mjs, teams/look/sheets/candidates-1.png, teams/look/sheets/candidates-2.png

- [L5] (look, measured) Letting paint relax inside a held surface solves the owner's hard case. In slab-line (a painted 1-wide diagonal A line in a B slab), the candidates turn the zigzag into one straight band, unite all six A blocks, and keep the slab top exactly flat. FID-0.15 keeps the staircase.
  numbers: Band-width SD on the top surface over the middle 3√2 of the diagonal: 0.050 (both candidates), 0.385 (FID-0.15), 0.409 (blocks). Mean band width 0.625 (blocks 0.708). Junctions AAAAA; slab-line B top max |dy| 0.000.
  refuteBy: Recompute bandWidth from the saved labels (labels/BOX0-PAINT-0.15-0.02/slab-line.bin.gz) or rerun. SD > 0.15, or any slab-top deviation > 0.0625 away from the line, refutes it.
  evidence: teams/look/results/BOX0-PAINT-0.15-0.02.json, teams/look/results/FID-0.15.json, teams/look/results/BLOCKS.json, teams/look/sheets/paint-test.png

- [L6] (engine, measured) FID-k at k ≥ 0.25 does not move the blocks at n 12, 16 or 24, so its look is only the renderer's blur. The render field rounds raw blocks itself (edge R 0.20, faces out 0.03), so 'blocks' pictures already look rounded, and D-field constraint checks fail for reasons unrelated to the physics.
  numbers: FID-0.25 Δ single 0.000 / 0.000 / 0.004 (n 12/16/24); FID-0.4 Δ max 0.002. BLOCKS on D: edge R 0.20, single extent 1.064, tunnel D clear height 1.899.
  refuteBy: Run FID-0.25 at n 32 on single and cube2-same (small grids). Δ > 0.05 would show the freeze is resolution-limited.
  evidence: teams/look/results/FID-0.25.json, teams/look/results/FID-0.25@n24.json, teams/look/results/FID-0.25@n12.json, teams/look/results/BLOCKS.json

- [L7] (physics, partly-measured) The engine reproduces Neumann's triple-junction angle, 180° − 2·asin(g/2), only at fine resolution and only where the anchor lets a groove form. In anchored FID regimes (k ≥ 0.1), a flat A|B seam stays flat: depth ≤ 0.0625 on the labels in 3D at n 16, and 0.006 in 2D at n 64/128 for FID-0.15. Material seams remain colour, not geometry.
  numbers: Neumann: 151.0° / 120.0° / 82.8° for g 0.5 / 1 / 1.5. FREE 2D double bubble at n 64: 143.2° / 107.1° / 63.5°; at g 1 over n 32/64/128: 90.6° / 107.1° / 116.9°. CAGE-0.25 at n 64, window 0.03–0.15: 154.5° (g 0.5), 129.1° (g 1). FINITE-4: 159.8° / 132.5° / 98.8°. 2D groove depth: FID-0.15 0.006, FID-0.05 0.139 (g 1).
  refuteBy: Run src/seam2d.mjs at n 256 (2D, ≈ 1.5 M cells for the slab; shrink the slab if needed). A FREE angle that moves away from 120°, or an FID-0.15 groove deeper than 0.05, refutes the respective part.
  evidence: teams/look/results/seam2d.json, teams/look/results/table-main.md, teams/look/sheets/seam2d.png

- [L8] (pattern, measured) Union of same-material diagonal contacts (jitter 0, and jitter 1e-3 with seeds 1–3), stated as final connectivity:
- Edge contact in air (diag-edge) unites in every regime that moves (4/4 runs in each of 14 regimes), but not in FID-0.4.
- Corner-only contact (diag-corner) never unites (0 of 60 runs).
- The 2×2 checkerboard never unites under FID or FINITE; under CAGE and FREE it unites only with jitter.
- A painted diagonal inside solid (slab-line) ends connected only where paint can move: CAGE, FINITE, FID-0.05, FREE, and the paint candidates.
  numbers: slab-line junctions:
- FID-0.25 / FID-0.15: -----
- FID-0.1: A---A in 3 of 4 runs
- FID-0.05: -AAA-
- CAGE-0.15, FINITE-2/4/8: AAAAA
- FREE: -AAA- (or --A-- in seed 3)
Under FID-0.15-g1.5 the engine merged the A phases transiently (6 → 2) but none stayed connected.
  refuteBy: Rerun src/union.mjs with more seeds (4–10) or at n 24 for the small cases. Any diag-corner union, or a diag-edge non-union in a moving regime, refutes the corresponding part.
  evidence: teams/look/results/union-table.md, teams/look/sheets/union.png

- [L9] (pattern, measured) In 3D, a 2×2 checkerboard X junction can resolve with both diagonal pairs united by layering: all A on top and all B below, a stacked double bubble. This is impossible in 2D. It happens in FREE seed 2 (jitter 1e-3) and in some CAGE seeds.
  numbers: FREE seed 2: B connected across the junction in layers y < 0.49 and A in layers y > 0.55. Both-pairs outcome ('X') in FREE seeds 2 and 3, CAGE-0.15 seed 2, CAGE-0.25 seed 3, CAGE-0.4 seed 2.
  refuteBy: Re-render FREE sq2-checker seed 2 (src/checkerx.mjs). If the plan cuts at y 0.15 and 0.85 do not show one material each, it is refuted.
  evidence: teams/look/logs/checker-x.log, teams/look/sheets/checker-x.png, teams/look/results/union-FREE.json

- [L10] (limitation, measured) Under FID-0.15 the volume constraint shows up as artefacts:
- one-sub-cell (0.0625) pillow bulges with visible terrace rings on flat faces of cube2-same, slab-halves and slab-stripe;
- the 1-wide hole of ring8 closes;
- the tunnel floor rises by 0.375.
The box with vertical cap 0 (BOX0) removes the top-face bulges; vertical faces still bulge by up to 0.125.
  numbers: FID-0.15: cube2 face bulge 0.062; slab-halves top +0.062 at the centre of each half; ring8 hole width 1.0 → 0; tunnel floor 1.375. BOX0 variants: slab tops 0.000; cube2 horizontal face bulge 0.062.
  refuteBy: At n 24 (cube2-same, ring8), the FID-0.15 bulge should shrink to one sub-cell (0.042) or vanish, while the ring hole stays closed. An open ring hole refutes the volume-into-concavity part.
  evidence: teams/look/results/table-main.md, <session>/sheets/spectrum-fid-2.png, teams/look/results/table-variants.md

- [L11] (limitation, measured) CAGE-r and FINITE-T turn every isolated single block into a sphere: label extent 1.25, the dilated-cage limit; a volume-1 sphere has diameter 1.24. FREE balls up all clusters, does not converge on terrain-step in 300 steps, and its terrace tops move by 1.0. These regimes cannot keep block identity for small builds.
  numbers: Single extent (labels) 1.250 in CAGE-0.15/0.25/0.4, FINITE-2/4/8 and FREE. FREE terrain-step: 300 steps, 127.5 s, low terrace +1.0. Effective cage radii after rounding to sub-cells: 0.125 / 0.25 / 0.375.
  refuteBy: Measure the single block's corner Req: a sphere gives about 1.0 relative to the cube corner. If CAGE-0.15 or FINITE-2 keeps a single-block corner Req < 0.2, it is refuted.
  evidence: teams/look/results/table-main.md, teams/look/sheets/spectrum-cage-finite-1.png

- [L12] (look, measured) At n 16, film tension g barely changes FID-0.15. Constraint numbers are identical for g 0.5, 1 and 1.5; the render-field seam opening at slab-halves narrows as g rises. g 1.5 lens-shapes the slab-dot dot and pulls apart the B and C blocks of L3-ABC, which touch only along an edge.
  numbers: Render-field opening (window 0.06–0.25): 173.3° / 165.6° / 157.1° for g 0.5 / 1 / 1.5. Tunnel clear height 1.0 in all three. slab-line A phases at the end (engine merge count): 4 / 6 / 2.
  refuteBy: Compare FID-0.15-g0.5 and -g1.5 tunnel and pillar numbers. Any constraint value differing by more than one sub-cell refutes 'identical constraints'.
  evidence: teams/look/results/table-main.md, teams/look/sheets/film-tension-g.png

- [L13] (pattern, partly-measured) In slab-line, the small A bubbles (one block each) win the X junctions against the large B halves (15 blocks each) whenever paint can move. A connects and B never does (B phases stay 2), in contrast to the symmetric 2×2 checkerboard. This fits the higher Laplace pressure of smaller bubbles.
  numbers: CAGE-0.15 and FINITE-2/4/8: AAAAA in 4 of 4 runs, B phases 2. sq2-checker under FINITE: no union in 4 of 4 runs. The Laplace-pressure reading is inference.
  refuteBy: A checker variant with large A clusters and single-block B blocks: if B does not win the junctions, the pressure reading is refuted.
  evidence: teams/look/results/union-table.md

- [L14] (engine, measured) MBO at this resolution is far too slow to run in the mesher. A look must be baked into a local rule.
  numbers: terrain-step (75 blocks, about 1.1 M cells): FID-0.15 10.8 s, BOX0-PAINT-0.15-0.02 14.1 s, FREE 127.5 s. Median steps 12–14 for the FID and BOX0 regimes. The mesher budget (single-digit ms per chunk) is from PLAN §7.6.
  refuteBy: A timing of the same engine at n 8 on terrain-step reaching under 100 ms with the same shape would weaken it.
  evidence: teams/look/results/table-main.md, teams/look/results/table-variants.md

## optimizations
- Bound the solid/air surface with a PLAN §7.4-style per-axis box (growth into air ≤ 0.15 horizontally, ≤ 0.05 or 0 vertically; eroded core always solid) instead of a soft anchor. Keep volume per cluster so small features keep their size.
  basis: ['teams/look/results/table-tunnel-cells.md', 'teams/look/results/table-variants.md']; gain: The constraints hold by construction (tunnel 2.0 × 0.75 at n 16 and 1.90 × 0.70 with the exact caps at n 20; flat ground exact) while the rounding stays at the FID-0.1/0.15 level. The candidates' Δ mean (0.047–0.080) is close to plain FID-0.15 (0.067).; risks: Measured at n 16 (box quantised) except the tunnel at n 20. Vertical faces still bulge up to 0.125. Per-cluster volume coupling remains (bounded by the box).
- Solve paint and shape separately. With a low paint fidelity (kMat ≈ 0.02) the material partition relaxes into smooth films (straight diagonal bands, round dots, S-curved seams on steps) while the surface stays held. Paint could be computed as a surface-confined 2D problem on the top-surface material map (inference).
  basis: ['teams/look/results/BOX0-PAINT-0.15-0.02.json', 'teams/look/sheets/paint-test.png']; gain: Solves the painted-diagonal hard case (band SD 0.409 → 0.050) with no geometric change to flat ground. A 2D paint solve would touch only surface cells (inference).; risks: The mesh needs a way to represent sub-quad material boundaries; today vertices split per (corner, material). Paint volume is still a per-cluster constraint.
- Replace per-cluster volume conservation with a local one (per block or per neighbourhood), so the result depends only on a bounded apron and can be meshed chunk by chunk or baked into a per-corner table, as the bevel's 256-entry table is.
  basis: ['teams/look/results/nonlocal-wide-n12.json', 'teams/look/results/nonlocal-WIDE-cands.json', 'teams/look/results/NV-FID-0.15.json']; gain: Removes the measured non-local coupling (4.3 block³ change from a bar at least 4 blocks away under FID-0.15; 0.05–0.19 block³ at 2.5 or more blocks for the candidates). Makes a deterministic, apron-bounded rule possible.; risks: Untested. Dropping volume entirely makes features vanish (NV-FID-0.15 Δ 1.0), so the local substitute must still protect small features.
- Use the union pattern as a topology rule: same-material edge contacts in air connect (a neck); corner-only contacts stay separate; painted diagonals inside solid connect when paint is free; symmetric X junctions need a deterministic tie rule.
  basis: ['teams/look/results/union-table.md']; gain: A table-friendly rule that matches the bubble model in every moving regime tested. It differs from the current mesher, where diagonal-only contacts stay pinched (PLAN §7.2).; risks: The checkerboard outcome depends on the seed in CAGE and FREE (and layered in 3D), so any game rule is a choice, not physics. Changing pinching changes mesh topology and the goldens.
## open
- Can BOX0-PAINT be baked into a local per-corner rule? The surface changes sit within about 0.5 block of edges and seams (Δ mean 0.047–0.080), but λ couples the whole cluster; a local volume substitute is untested.
- How should smooth paint boundaries (straight diagonal bands, round dots) be represented in the mesh, given vertices split per (corner, material)?
- Does the owner want grooves at material seams? Anchored regimes give colour-only seams; grooves need FID ≤ 0.05, FINITE or a cage, all of which break constraints unless the groove is added inside a box (untested).
- 3D checkerboard X junctions can unite both pairs by layering (FREE seed 2). Which outcome should a game rule pick, given it depends on the seed?
- Why does CAGE-0.25 with g 1.5 separate A from B with an air gap in 2D (n 64), when g < 2 should keep the film? Pinning, or a real instability of a squeezed contact?
- All scenes float in air (no ground or periodic boundary). The FREE and terrain-step numbers are partly artefacts of that; the tunnel and locality results come from inside one cluster and should not depend on it (inference).
- The candidates were swept over the catalogue only at n 16, where the box is quantised to 0.125 / 0. Only the tunnel was checked at n 20 with the exact 0.15 / 0.05 caps. Do the looks and constraints hold at finer n?
- The FID-k look is set by MBO pinning at s 0.2, not by k alone: a continuum estimate gives a fillet radius of about 0.53 at k 0.15 against an edge Req of 0.17 measured (inference). Another solver given the same k would give a different look.
- The REPORT.md write was refused by the harness, so the report is this structured result; tables are in results/table-main.md, table-variants.md, table-tunnel-cells.md and union-table.md.
## images
- teams/look/sheets/spectrum-fid-1.png: Spectrum, fidelity family (part 1): rows are single through slab-dot; columns are BLOCKS, FID-0.4, 0.25, 0.15, 0.1, 0.05, FREE (views, n 16, g 1). FID ≥ 0.25 looks like the blocks; from FID-0.15 the look rounds, with pillow terraces.
- teams/look/sheets/spectrum-fid-2.png: Spectrum, fidelity family (part 2): slab-line through slab-halves. The tunnel and ring hole close from FID-0.1; slab-line straightens only at FID-0.05, where the slab pillows.
- teams/look/sheets/spectrum-cage-finite-1.png: Spectrum, cage and finite-time families (part 1): BLOCKS, CAGE-0.15/0.25/0.4, FINITE-2/4/8, FREE. Single blocks become spheres in every column.
- teams/look/sheets/spectrum-cage-finite-2.png: Spectrum, cage and finite-time families (part 2): beaded A line in FINITE-2/4, ripple terraces in FINITE-8, tunnels closing, pillar becoming a lemon or a ball.
- teams/look/sheets/slices-1.png: Slices across 11 regimes for cube2-same, sq2-same, tunnel (z = 1.5), terrain-step, stairs and pillar3. Black = film between bubbles; white = air surface.
- teams/look/sheets/slices-2.png: Slices across 11 regimes for painted layers: slab-dot, slab-line and slab-stripe plans at y = 0.5, slab-halves section z = 3, ring8 plan.
- teams/look/sheets/film-tension-g.png: FID-0.15 with film tension g = 0.5 / 1 / 1.5 on the nine multi-material configurations (views, then sections).
- teams/look/sheets/seam2d.png: 2D cross-section of a straight A|B seam in a 1-thick slab, n 64: FREE, FID-0.15, FID-0.05, FINITE-4 and CAGE-0.25 at g 0.5 / 1 / 1.5. FID-0.15 leaves the seam flat; CAGE-0.25 at g 1.5 detaches (unexplained).
- teams/look/sheets/union.png: Union of diagonal contacts under 7 regimes (jitter 1e-3, seed 1): diag-edge (plan), diag-corner (view), sq2-checker (plan), slab-line (plan).
- teams/look/sheets/checker-x.png: sq2-checker, FREE, jitter 1e-3, seed 2: both diagonal pairs unite by stacking A over B (view, plan cuts at y = 0.15 / 0.5 / 0.85, section).
- teams/look/sheets/nonlocal.png: Locality test, n 12: a 6×4×3 host with a tunnel, alone / with a bar attached at least 4 blocks away / with the bar detached, under FID-0.15, FINITE-4 and BOX0-PAINT-0.1. The FID-0.15 tunnel closes only when the bar is attached.
- teams/look/sheets/paint-test.png: Paint relaxing inside a held surface: slab-line, slab-dot, slab-stripe and terrain-step under BLOCKS, FID-0.15, BOX-PAINT-0.15-0.02 and BOX-PAINT-0.15-0 (box vertical cap 0.0625, so pillow rings remain).
- teams/look/sheets/candidates-1.png: Candidates over the catalogue (1/2): for single through slab-dot, BLOCKS, BOX0-PAINT-0.15-0.02 and BOX0-PAINT-0.1-0.02 views, then the same three as slices (engine copy, n 16).
- teams/look/sheets/candidates-2.png: Candidates over the catalogue (2/2): slab-line becomes a straight band, terrain-step's grass/dirt seam follows the step as an S-curve, the tunnel keeps its opening, flat tops stay flat.
report: teams/look/results/table-main.md