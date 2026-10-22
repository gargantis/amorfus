# v-table

I attacked the table claims (T3 to T12), fast C11 and prior corner-classes. I rebuilt the repo's surface-nets mesh: one vertex per mixed corner, quads per solid/air face, split on the shorter diagonal, 1/256 quantisation. I meshed it with 13 vertex placements: cube, the real repo mesher in bevel and hints modes, table's no-volume, volume and terrain-K8 tables, the on-surface physics vertex, half of it, and a new table fitted to the mesh error itself (2-fold or held-out windows). Each mesh was scored in both directions against the physics surface: the render field D, and also a label surface L with almost no blur. The test set was 47 + 29 terrain windows of seed [1,1], 22 + 10 windows of a new seed [7,13], 5 builds and fast's 36 catalogue references, all under FID-0.15 and FINITE-4 (metric checked: logs/test-metric.log). Claim (1) holds on four seeds and two other regions: 30-31 classes cover 99% and 48-61 cover 99.9%. One caveat: about 70% of these 'terrain' corners are cave walls. The vertex numbers of claim (2) reproduce (0.045-0.069 against 0.120-0.162 for bevel and 0.196-0.263 for cube). But vertex error does not predict mesh error. Under FID, bevel is better than cube on vertices and worse on the mesh. The physics vertex is not the best mesh vertex under FID. The no-volume table's mesh advantage over plain cubes under FID is only 6-17% on D and zero on the label surface. On builds the table is 2-3 times worse than cubes. Claim (3)/C11 reproduces on fast's catalogue and roughly on builds, but is refuted on generated terrain. There, on-surface vertices beat cubes by 2x under FINITE-4 (46/47 windows) and moderately under FID. The real optimum is an offset of about 0.3-0.7 times the physical one, which a patch-fitted table delivers out of sample (FID terrain 0.037-0.040 against cube 0.060-0.061 and the no-volume table 0.049-0.058). FINITE-4 terrain is converged in n already at n=12 (n12 vs n20 reference shift 0.009 vertex / 0.007 surface), so the table's advantage survives the converged reference. My 2D analysis puts the limit at a fillet radius of about 0.5 block: below it a 1-block-spaced surface-nets mesh cannot show the rounding at all. Everything is in teams/v-table/ (index: logs/notes-v-table.txt), backed up with rsync; nothing written to the repo; no processes left running.

- [combined (1) / table T3: terrain surface corners concentrated (32 classes 99%, 62 for 99.9%, 88.8% single-material, 12.3% non-Plateau, almost all same-material diagonal contacts)] CONFIRMED
  corrected: Confirmed as stated, across seeds and regions. Add that about 70% of 'terrain surface corners' are cave walls (stone only), so the shares describe caves more than the visible landscape.
  numbers: Other seeds and regions: 99% needs 30-31 classes, 99.9% needs 48-61. Single-material 86.5-88.8%; non-Plateau 12.3-13.5%. Classes seen grow to about 150 with 2.7 M corners (long tail). Non-Plateau corners with no same-material diagonal on an X edge (X types air/diff or diff/diff): 0.044-0.049% of surface corners, i.e. 99.6% of non-Plateau corners do have one. Stone-only corners are 69.5-71.2% of surface corners; 99.7% of them lie below H-4, i.e. cave walls. Top-surface corners (grass/dirt/sand present) are about 29%.
- [combined (2): no-volume per-corner table (63 KB, +0.14 ms/chunk) stands in for the physics on terrain to 0.04-0.06 vertex error vs bevel 0.136 / cube 0.208, fails on small objects (0.15)] PARTLY
  corrected: Under FINITE-4 the no-volume table approximates terrain vertices to 0.045-0.062. It gives a terrain mesh 40% better than cube and 18-20% better than bevel, but on-surface vertices and a patch-fitted table are better again.

Under FID its vertex error is 0.057-0.069, yet its mesh is only 6-17% better than plain cubes on the render field and no better than cubes on the label surface. A table fitted to mesh error does 25-30% better (0.037-0.040).

On builds it is worse than cubes (2-3x), and on small objects about 4x worse than cubes, as claimed. Cost and size claims hold.
  numbers: Vertex error against the on-surface physics vertex (no-vol table / bevel / cube): FINITE-4 seed 1, 47 windows: 0.045 / 0.120 / 0.252. FID seed 1, 29 windows: 0.057 / 0.132 / 0.196. New seed FINITE-4, 22 windows: 0.062 / 0.128 / 0.241. New seed FID, 10 windows: 0.069 / 0.162 / 0.209.
Mesh error (symmetric, D surface), no-vol table vs cube / bevel / on-surface / patch-fit:
- FINITE-4 seed 1: 0.054 vs 0.096 / 0.066 / 0.045 / 0.050
- FINITE-4 new seed: 0.061 vs 0.090 / 0.076 / 0.049 / 0.046-0.049
- FID out-of-sample seed 1: 0.049 vs 0.060 / 0.078 / 0.045 / 0.037
- FID new seed: 0.058 vs 0.061 / 0.096 / 0.059 / 0.040
- FID against the L surface: 0.051 vs cube 0.051
- Builds: FID 0.054 vs cube 0.024; FINITE-4 0.107 vs cube 0.034
- Catalogue: FID 0.149 vs cube 0.041; FINITE-4 0.205 vs cube 0.079
Lookup cost rerun: +0.233 and +0.133 ms per chunk; 63,441 bytes.
- [fast C11 / combined (3): with one vertex per corner, on-surface vertices do NOT minimise mesh error; vs FID-0.15 cube corners give smaller quad-patch error (0.034) than on-surface vertices (0.113)] PARTLY
  corrected: On-surface vertices do not minimise mesh error, which confirms the mechanism. But plain cubes win only for small isolated objects and builds, where the physical rounding radius is below about 0.5 block.

On generated terrain, on-surface vertices beat cubes: by 2x under FINITE-4, and modestly or not at all under FID. The minimum lies at an offset of about 0.3-0.6 times the physical one (FID) or 0.5-0.7 times (FINITE-4). A per-class table fitted to mesh error captures this out of sample.
  numbers: Catalogue, mesh error cube vs physics on-surface vertex: FID 0.041 vs 0.067 (cube better in 34/36); FINITE-4 0.079 vs 0.088. Config-mean mesh-to-sim: cube 0.043 vs on-surface 0.090 (fast's metric: 0.034 vs 0.113). Builds: FID cube 0.024 vs on-surface 0.026 (FINITE-4 0.034 vs 0.037).
Terrain: FINITE-4 on-surface 0.045 vs cube 0.096 (46/47 windows), new seed 0.049 vs 0.090. FID on-surface 0.047 vs cube 0.059 (16/29 windows); new seed 0.059 vs 0.061 (4/10).
Half the physical offset: FID terrain 0.035, beating both.
Patch-fitted offsets as a fraction of the physical terrain offset: FID convex edge 0.042/0.136, concave edge 0.049/0.137, convex corner 0.156/0.272, concave corner 0.139/0.264. FINITE-4 0.106/0.201, 0.141/0.204, 0.202/0.303, 0.196/0.295.
- [table T4: volume E2c table biased on terrain (0.107 FID / 0.082 FINITE vertex)] PARTLY
  corrected: Confirmed for vertex error. At mesh level the 'biased' volume table is as good as or better than the no-volume table in 4 of 5 terrain and build comparisons. Its under-rounding hurts little, because a 1-block mesh cannot show sub-block rounding anyway.
  numbers: Volume-table vertex error: FID 0.099, FINITE-4 0.082. Mesh error, volume vs no-volume table: FID seed 1 0.043 vs 0.049; FID new seed 0.049 vs 0.058; FINITE-4 seed 1 0.058 vs 0.054; FINITE-4 new seed 0.053 vs 0.061; builds FID 0.037 vs 0.054.
- [table T5: no volume constraint reproduces terrain because terrain bubbles have pressure ~0] PARTLY
  corrected: Pressure near 0 is measured for large terrain bubbles, so the mechanism holds on average. Where a window holds thin or small bubbles (1-high cave tunnels), the volume constraint changes the surface by about 0.1. There the no-volume table is worse than cubes.
  numbers: Pressure of phases with at least 50 blocks: FINITE-4 median 0.002 (p10 -0.024, p90 0.034); FID median 0 (p10 -0.021, p90 0.033). Phases under 50 blocks: median 0.04-0.08.
FINITE-4 volume vs no-volume terrain runs: on-surface vertex differs by 0.032 mean and the surface by 0.024 mean (below the 0.05 refute threshold). The worst windows are t0a (0.130) and t11b (0.095), which are where the no-volume table's mesh fails: t0a 0.119 vs cube 0.053.
- [table T6: no single 2x2x2 table fits all contexts; missing input is bubble size/pressure] PARTLY
  corrected: True at vertex level. At mesh level the volume table is never far from the best table in any context, though cubes beat every table on small objects. The 'missing pressure' reading fits the t0a/t11b evidence; that link is inference.
  numbers: Volume-table vertex error: terrain 0.082-0.099, builds 0.040-0.042, catalogue 0.070-0.077 (no single table under 0.07 everywhere). Catalogue mesh error: volume table 0.079 (FID) / 0.108 (FINITE-4), no-volume table 0.149 / 0.205, cube 0.041 / 0.079.
- [table T7: larger keys (K32, K64) do not pay on terrain] CONFIRMED
  corrected: Confirmed for vertex error. Under FINITE-4, K32 with fallback gains about 6%; negligible.
  numbers: FID: K8 with fallback 0.044 / 0.035; K32 0.043 / 0.037 (coverage 33% / 30%); K64 coverage about 2%. FINITE-4: K8 0.029 / 0.031; K32 0.027 / 0.029 (coverage 39% / 36%); K64 coverage 2-4%.
- [table T8: material identity barely moves the vertex (K8bin ~ K8)] CONFIRMED
  numbers: K8bin vs K8 (cross-validated): FID 0.047 vs 0.044 and 0.035 vs 0.035; FINITE-4 0.037 vs 0.029 and 0.035 vs 0.031.
- [table T9: seam vertex shifted in-plane toward the odd block (class 11: 0.146 FID / 0.237 FINITE) plus a groove] PARTLY
  corrected: Under FINITE-4 the shift survives on labels and at higher n: about 0.18-0.24. Under FID it is about 0.1 on labels (no-volume embedding) and about 0 with volume. The 0.146 measured on D is partly render blur. Measured in the class embedding, not in terrain windows.
  numbers: Label-based seam shift, n 12/16/20:
- FINITE-4 no volume: 0.24 / 0.18 / 0.19
- FINITE-4 volume: 0.09 / 0.12 / 0.14
- FID no volume: 0.09 / 0.12 / 0.09
- FID volume: 0.01 / -0.01 / -0.01 (none; the render field D gives 0.04)
- [table T10: per-(corner, material) vertex positions would open cracks] UNTESTED
  corrected: Untested numerically. The crack consequence follows from the repo topology, because adjacent quads of different materials share corner edges (inference).
  numbers: The 0.806 separation was not re-measured.
- [table T11: 21,147 x 3 int8 = 63 KB table, +0.14 ms per chunk] CONFIRMED
  numbers: 63,441 bytes; 17,006 surface patterns filled; +0.233 and +0.133 ms per chunk.
- [table T12: same-material diagonal classes carry disproportionate error (97/27/92: 5.6% of corners, 18.8% of error)] CONFIRMED
  corrected: The direction is confirmed; the share is smaller than claimed (13-14% rather than 18.8% for the three classes).
  numbers: Classes 97/27/92: FID 3.9% of corners and 13.1% of error; FINITE-4 5.6% and 13.8%. Class 27 mean error 0.60-0.64. All ambiguous-union classes: FID 9.5% of corners, 20.9% of error (mean 0.126 vs 0.050); FINITE-4 14.7% and 30.2% (0.092 vs 0.037).
- [prior corner-classes: few classes pass Plateau checks, so most corners need a topological (T1/pop) decision before smoothing] PARTLY
  corrected: True of classes, false of frequency. On generated terrain only about 13% of surface corners need a topological decision, almost all same-material diagonal contacts.
  numbers: Generated terrain, four seeds: 86.5-87.7% of surface corners are Plateau-legal; non-Plateau 12.3-13.5%.
- [(b) does the table's advantage survive a converged FINITE-4 reference (T13 says FINITE-4 not converged by n=20)?] CONFIRMED
  corrected: Yes. The n-dependence in T13 belongs to the volume-constrained class embedding. Terrain FINITE-4 and the no-volume table are both converged to within 0.01-0.03 at n=12, and building the table at n=20 does not help.
  numbers: Terrain reference n12 vs n20: vertex 0.0094, surface 0.0067 (n16 vs n20: 0.0072 / 0.0041).
Mesh error against the n20 reference: on-surface 0.042, volume table 0.051, no-vol table 0.058, n20-built table 0.060, bevel 0.073, cube 0.102. Vertex error at n20: no-vol table 0.059, bevel 0.135, cube 0.264.
No-volume class table, top 25 classes: mean |n12-n20| 0.026, |n20-n24| 0.006.
## new findings
- Vertex error does not rank meshes. Under FID on terrain, bevel has lower vertex error than cube (0.132 vs 0.196) but higher mesh error (0.081 vs 0.059). The exact physics vertex (0.047) loses to half of it (0.035). Fitting a table to vertex error is the wrong target whenever the physical rounding radius is below about 1 block.
- A per-class table fitted to mesh error is the best table out of sample under FID and competitive under FINITE-4. FID terrain: 0.037 (held-out seed-1 windows) and 0.040 (new seed), against 0.049/0.058 for the no-volume table, 0.060/0.061 for cubes and 0.078/0.096 for bevel. FINITE-4: 0.050/0.046-0.049 against 0.054/0.061 for the no-volume table. Its offsets are 0.3-0.6x (FID) or 0.5-0.7x (FINITE-4) the physical ones. On builds it does not beat cubes (FID 0.028 vs 0.024). Same 21,147-entry layout, so same cost (inference).
- (c) What rounding a block-resolution surface-nets mesh can represent. In a 2D convex edge with fillet radius r and vertices 1 block apart:
- r <= 0.3: the best edge-vertex offset is 0 (cube); on-surface placement is 4-7x worse.
- r = 0.4 / 0.5 / 0.6: the best placement recovers 6% / 19% / 33% of the cube's error, with offsets 0.02 / 0.045 / 0.08 against on-surface 0.12 / 0.15 / 0.18.
- r = 0.75: on-surface first beats cube; 52% recovered.
- r = 1: 78%. r >= 1.25: about 90%.
Assuming circular fillets (inference), terrain edge offsets measured on D correspond to r about 0.46 (FID) and 0.69 (FINITE-4), so FID sits at the threshold. The FID fit's edge offset (0.042) matches the 2D prediction (0.045). Rounding below about half a block cannot be shown; 1-block staircases turning into slopes can.
- Under FID, part of the measured rounding comes from the render blur in D. Against the label surface, the no-volume table's terrain mesh error equals the cube's (0.0514 vs 0.0509). On the catalogue the cube mesh is closest to the labels by far (0.025 vs on-surface 0.063). Under FINITE-4 the ranking is the same on D and on labels.
- The no-volume table fails where the volume constraint matters.
- Thin 1-high cave tunnels (t0a): volume vs no-volume runs differ by 0.13, and the table's mesh is 0.119 against the cube's 0.053; it pinches the tunnel ends.
- Builds: the table's mesh is 2-3x the cube's.
A size or pressure input (table's optimisation 3) is needed for builds and caves, not only for small objects.
- The no-volume table's seam entries (vertex at the seam point) cost a little surface accuracy compared with the same table's surface-nets vertex. My solid/air metric does not score where material seams fall, so this is a trade-off, not a defect.
## open
- Which surface is 'the physics' for the owner's look: the render field D (adds about 0.07 per axis of edge rounding) or the labels? Under FID the no-volume table's mesh advantage over cubes exists only on D.
- Material seams are not scored by my solid/air metric. A seam-position metric is needed before choosing between seam-point vertices and surface-nets vertices at seam classes (table T9/T12).
- The patch-fit was fitted to the D surface on 12-24 windows of seed [1,1]. It held out of sample on 22 + 10 windows of seed [7,13]. Rare classes reached extreme offsets (up to 0.5), which may overfit; a size or pressure bucket was not tried.
- My first new-seed set (t7) mostly missed the surface (5 FINITE-4 / 2 FID windows), so set t8 is the real new-seed test. FID windows on the new seed are only 10.
- T10's 0.806 per-material separation was not re-measured. Class-11 seams were measured on labels only in the class embedding, not in terrain windows (the seed-1 FID caches lack phase-to-material maps).
## images
- teams/v-table/sheets/mesh-vs-physics.png: Contact sheet: mesh cross-sections against the physics solid (grey) for terrain t13s/t15b/t0a (FINITE-4), terrain t6s and build b-stairs (FID-0.15), and the 2D rounding chart. Colours: black cube, cyan bevel, orange no-volume table, magenta on-surface, green patch-fit (out of sample). Labels give each window's mesh error.
- teams/v-table/img/slice-t6s-FID-z51.5.png: Terrain t6s, FID-0.15 n12, cut at z=51.5. At a 1-block step, on-surface vertices (magenta) and the table (orange) chamfer the step over a whole block. The physics stays nearly sharp, and the patch-fit (green) stays close to it. Mesh error: cube 0.036, table 0.041, on-surface 0.045, fit 0.022.
- teams/v-table/img/slice-t13s-FINITE-4-fit-z17.5.png: Terrain t13s, FINITE-4 n12, cut at z=17.5. The physics turns a 1:1 staircase into a slope; every moved-vertex rule follows it and the cube does not. Mesh error: cube 0.127, bevel 0.045, table 0.028, on-surface 0.025, fit 0.055.
- teams/v-table/img/slice-t0a-FINITE-4-z42.5.png: Cave window t0a, FINITE-4 n12, cut at z=42.5: a 1-high tunnel. The no-volume table (orange) pinches the tunnel ends harder than the physics does. Mesh error: table 0.119, cube 0.053.
- teams/v-table/img/slice-b-stairs-FID-z7.5.png: Build b-stairs, FID-0.15 n12, cut at z=7.5. The physics keeps the steps; bevel (cyan) turns them into a slope. Mesh error: cube 0.038, bevel 0.087, table 0.073, on-surface 0.033, fit 0.042.
- teams/v-table/img/round2d-chart.png: 2D convex edge, fillet radius r on x (0 to 2 blocks), mesh error on y (0 to 0.04). Black: cube. Magenta: on-surface vertices. Green: best offsets. Below r of about 0.4 the cube is optimal; on-surface wins from r of about 0.75.