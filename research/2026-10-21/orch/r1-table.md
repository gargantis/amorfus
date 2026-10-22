# TEAM table

I did not write REPORT.md: this harness refuses report .md files from subagents. This structured result is the report, and every number in it cites a log or JSON in teams/table/ (backed up with rsync).

**Corner classes.** I enumerated the 2x2x2 neighbourhoods of a lattice corner and checked the counts several ways. Brute force, de Bruijn/Burnside and a fixed-point Burnside agree, and so does team prior's independent count:
- With materials as the unit there are 738 classes. 551 of them are surface classes.
- With clusters as the unit there are 225 classes.
- With solid/air only there are 22 classes.
- Only 76 of the 738 classes (52 of the 551 surface classes) obey Plateau's laws.

**Generated terrain is very concentrated.** Over 448 chunks of seed [1,1] there are 384,419 surface corners:
- 32 classes cover 99% and 62 cover 99.9%.
- 88.8% of surface corners have a single material.
- 12.3% are non-Plateau, almost all same-material diagonal contacts. True four-material X edges are 0.031%.

**Tables from simulated classes.** I simulated all tabulated classes in canonical embeddings (FID-0.15 and FINITE-4, n=12). I then compared those tables against full simulations of 51 terrain windows, 5 build windows and the 36 catalogue configurations.
- A table that keeps the per-bubble volume constraint misses terrain by 0.107 block on average (FID). The cause is that straight edges stay pinned in the embedding but round in real terrain.
- Dropping the volume constraint gives 0.059 (FID) and 0.038 (FINITE). A table learned from terrain gives 0.035–0.040 (2-fold cross-validation). The floor is 0.023: the same corner measured in two shifted windows differs by that much.
- The repo's bevel rule scores 0.136 and unmoved block corners 0.208 on the same terrain corners.
- Larger keys do not help. Keys of 32 or 64 blocks cover only 31% or 5% of held-out terrain corners, and with fallback they score the same 0.040.
- No single 2x2x2 table fits both terrain and small isolated objects. On the catalogue the no-volume table scores 0.153 and the volume table 0.067. What the table lacks is the size or pressure of the bubble, not more neighbours.

**Verdict.** A precomputed table is viable for the mesher on cost and coverage. It is 63 KB, adds 0.14 ms per chunk in Node, and can hold all 551 surface classes. For terrain it stands in for the physics to about 0.04–0.06 block mean. It does not stand in for the physics on small objects or on same-material diagonal contacts, which need connectivity beyond the 2x2x2.

**Changes to the shared engine.** I used a copy of lib/mbo.mjs, src/mbo-clamp.mjs, with two marked changes:
- A clamp-to-edge blur at the grid boundary, so a window cut is not a surface. With a margin of at least 1 block it gives the same result as lib.
- A `bbox` option that fixes the grid bounds.

- [T1] (pattern, measured) With materials as the unit, the 2x2x2 neighbourhood of a lattice corner has 21,147 labellings up to material renaming. Up to the 48 cube symmetries (air fixed) these form 738 classes. By number of distinct materials: 0:1, 1:21, 2:125, 3:245, 4:223, 5:94, 6:24, 7:4, 8:1. Of these, 551 contain both air and solid (mesher surface corners), 531 contain air and at least 2 materials, and 186 have no air. Solid/air only gives 22 classes. With clusters as the unit (same material but not face-connected inside the 2x2x2 counts as separate bubbles) there are 6,153 structures and 225 classes. By number of clusters: 0:1, 1:13, 2:47, 3:67, 4:59, 5:26, 6:9, 7:2, 8:1. The 8-material class cannot occur in the game, which has 7 solid materials.
  numbers: 738 / 551 / 531 / 186 / 22 / 225 classes; three counting methods agree (brute force, de Bruijn power-group Burnside, fixed-point Burnside); team prior's independent count also agrees
  refuteBy: An independent enumeration, e.g. Polya with a different encoding, that gives any different class count.
  evidence: teams/table/logs/enum.log, teams/table/res/classes.json, teams/table/logs/crosscheck-prior.log, teams/table/src/enum.mjs

- [T2] (pattern, measured) Non-Plateau junctions are the rule among classes but the exception on terrain. 662 of 738 classes (499 of 551 surface classes) contain at least one of: a lattice edge with 4 films around it (650 classes; 435 with 4 distinct phases), more than 4 bubbles at the corner (280 counting materials, 539 counting clusters), or a same-material diagonal-only contact (513). Only 52 surface classes are Plateau-legal. On generated terrain (wide sample, 384,419 surface corners) 12.26% of surface corners are non-Plateau, almost all ambiguous same-material diagonal contacts. Four-distinct-phase X edges are 0.031%, and corners with more than 4 bubbles counting materials are 0. A terrain surface corner has at most 3 materials.
  numbers: Terrain wide sample: ambiguous union 10.84% (single-material 5.90%, multi-material 4.94%); X edges with no solid ambiguity 1.42%; more than 4 bubbles counting clusters 0.37%. bench16: non-Plateau 14.8%. Builds: 6.26% non-Plateau (checker class 14 at 4.65%; house 4-distinct X at 1.61%).
  refuteBy: Re-sample other seeds or chunks and find 4-distinct-phase X edges or more than 4 materials at a corner well above 0.1% of terrain surface corners.
  evidence: teams/table/logs/enum.log, teams/table/logs/freq.log, teams/table/logs/freqq.log

- [T3] (pattern, measured) Terrain surface corners concentrate in very few classes. In 448 chunks (8x8 chunk columns, cy -2..4, seed [1,1]) there are 384,419 surface corners. They fall into 131 classes; 32 classes cover 99% and 62 cover 99.9%. The top 7 classes are all single-material and cover 79.7%: flat 20.1%, concave edge 14.8%, convex edge 10.9%, concave corner 10.9%, two step classes 9.0% and 7.5%, convex corner 6.5%. Single-material corners are 88.8%. bench16 gives 96 classes, with 33 for 99% and 62 for 99.9%. The synthetic builds give 18 classes, with 15 for 99%.
  numbers: Surface corners: wide 384,419; bench16 47,554; builds 2,235. Classes covering 99% / 99.9%: 32 / 62 (wide), 33 / 62 (bench16), 15 / 17 (builds).
  refuteBy: Count classes on another seed or a larger chunk sample and find that more than about 50 classes are needed for 99%.
  evidence: teams/table/logs/freq.log, teams/table/logs/cumshare.log, teams/table/res/freq.json

- [T4] (limitation, measured) A class table built from canonical embeddings that keep the per-bubble volume constraint is biased against real terrain. The embedding (E2c) extrudes each octant block to 2^3 and continues it past the box with a clamp blur. Measured against full simulations of 51 terrain windows, its vertex lies 0.107 block from the measured vertex on average (FID-0.15) and 0.082 (FINITE-4). The reason is that straight edges and corners stay pinned or under-rounded in the embedding but round in terrain. For the convex edge (class 2) the table gives 0.0375 per axis against a terrain mean of 0.136; the convex corner (class 1) 0.176 against 0.272; the concave corner (class 249) -0.176 against -0.264.
  numbers: Mean distance from the measured vertex on terrain-random corners (n 2,260), FID / FINITE: volume E2c table 0.107 / 0.082; bevel 0.136 / 0.121; blocks 0.208 / 0.256. All at n=12.
  refuteBy: Repeat at n=16 or 20 and find that edges round in E2c with the volume constraint and the bias falls below about 0.05.
  evidence: teams/table/logs/evaltab.log, teams/table/res/table/FID-0.15_E2c_n12_clu.json, teams/table/res/table-K8-terrain-FID-0.15.json, teams/table/res/scenes/terrain_FID-0.15_n12.json

- [T5] (physics, partly-measured) The per-bubble volume constraint (pressure) is what makes the canonical table depend on context. The same E2c embedding run with volume:false reproduces terrain closely. On terrain-random corners the mean distance from the measured vertex is 0.059 (FID-0.15) and 0.038 (FINITE-4); on terrain-seam windows it is 0.049 and 0.037. Weighted by count over the 16 most frequent terrain classes, the gap between canonical and terrain-mean vertex falls from 0.097 to 0.039 (FID) and from 0.066 to 0.0145 (FINITE).
  numbers: No-volume table on terrain-random: p90 0.120 / 0.073, p99 0.319 / 0.235 (FID / FINITE). Inference, not measured: the bubble pressures in the terrain windows were not recorded, so 'huge terrain bubbles behave as pressure ~ 0' is an interpretation.
  refuteBy: Record the lambda of each bubble in the terrain windows. If they are far from 0, or if a no-volume terrain run differs from the volume run by about 0.05 or more, the mechanism is wrong.
  evidence: teams/table/logs/novol.log, teams/table/res/novol.json, teams/table/logs/evaltab.log, teams/table/res/table/FID-0.15_E2c_n12_clu-novol.json

- [T6] (limitation, measured) No single 2x2x2 table fits all contexts. The missing input is the bubble's size or pressure, not more neighbours. On the shared catalogue (isolated objects of 1 to 75 blocks) both the no-volume table and the terrain-trained table do badly, while the volume E2c table and the 8-blocks-alone embedding do much better. On builds the volume table is best.
  numbers: Catalogue, FID / FINITE: no-volume 0.153 / 0.168; terrain K8 0.151 / 0.151; volume E2c 0.067 / 0.070; E1m 0.079 / 0.098. Builds: volume E2c 0.044 / 0.044; no-volume 0.049 / 0.084. Embedding differences: E1m vs E2c tables differ by a frequency-weighted 0.199 / 0.194; E2c vs E3c (box size) by only 0.0013 / 0.012.
  refuteBy: Find a single table, for example keyed on K8 alone with any embedding, that scores below 0.07 on terrain, builds and catalogue together.
  evidence: teams/table/logs/evaltab.log, teams/table/logs/analyze.log

- [T7] (optimization, measured) Larger keys do not pay on terrain. In 2-fold cross-validation by bench chunk over 3,115 terrain corners (FID-0.15), the 2x2x2 class key K8 covers 97.2% of held-out corners with mean error 0.035 (0.040 including corners that fall back to the E2c table). The other keys add no accuracy once a fallback is included: K32 (2x2x2 plus 24 face neighbours) covers 30.6%, K32eq (face neighbours reduced to 3 states) 33.0%, and K64 (4x4x4) 5.0%, and with fallback to K8 then E2c each scores 0.040 to 0.041. The terrain sample holds 49 distinct K8 keys, 1,602 K32 keys and 2,723 K64 keys among 3,115 corners. Under FINITE-4 K8 scores 0.031 on covered corners and 0.036 with fallback, and the larger keys add nothing either.
  numbers: Covered-corner error K32 0.033, K64 0.017 (on 155 corners). Twin-window floor 0.023.
  refuteBy: Train on many more windows, for example 500, and show that K32 coverage rises above about 80% with error clearly below K8's 0.035.
  evidence: teams/table/logs/analyze.log, teams/table/res/analysis.json

- [T8] (pattern, measured) Material identity barely moves the vertex on terrain except at seams. A solid/air-only key (K8bin, 13 to 17 entries) scores 0.047 in cross-validation against 0.035 for the full K8 (FID). Multi-material edge and corner classes take the vertex of their single-material counterpart. Examples (terrain means, canonical frame): the grass/dirt slope class 97 is [0,-0.139,-0.139] against concave edge class 95 at [0,-0.137,-0.137]; classes 250, 253 and 257 sit at -0.27 to -0.29 per axis against class 249 at -0.264.
  numbers: K8bin trained on terrain and applied to builds: 0.064 (100% coverage); K8: 0.055 (84.1% coverage).
  refuteBy: Show terrain seam-free multi-material classes whose mean vertex differs from the single-material class with the same solid mask by more than 0.05.
  evidence: teams/table/res/table-K8-terrain-FID-0.15.json, teams/table/logs/analyze.log

- [T9] (look, measured) The physics moves seam vertices in the same direction as the repo's bevel seam shift but by a different amount, and adds a groove. For the flat half with one odd block (class 11, the bevel seam case) the terrain-trained vertex in canonical frame is [0.146, 0.070, 0.146] under FID-0.15 and [0.237, 0.140, 0.237] under FINITE-4. That is an in-plane shift toward the odd block of 0.146 / 0.237 per axis (bevel uses 0.25), plus a dip into the solid of 0.07 / 0.14. On terrain seam corners the bevel rule lies further from the measured vertex than unmoved block corners do; the no-volume table is closest.
  numbers: Terrain-random seam corners (n 149), FID: bevel 0.240, blocks 0.157, volume table 0.111, no-volume table 0.068, terrain K8 0.039. Under FINITE: bevel 0.226, blocks 0.263, no-volume 0.077. Seam points are grid-limited to about ±0.02.
  refuteBy: Measure seams on labels instead of the render field D, at n=16 or more, and find the class-11 in-plane shift outside 0.1–0.25 per axis.
  evidence: teams/table/res/table-K8-terrain-FID-0.15.json, teams/table/res/table-K8-terrain-FINITE-4.json, teams/table/logs/evaltab.log

- [T10] (limitation, partly-measured) Giving each (corner, material) its own vertex position is not a viable layout. The per-material surface-nets vertices at a seam corner sit far apart, so splitting positions by material would open cracks. The per-material information belongs in where the single shared vertex sits, namely on the seam (triple line). That is what the mesher's shared-position split already assumes. The class table does predict the per-material vertices well.
  numbers: Mean separation of per-material vertices: terrain 0.806 block (FID, n 275), catalogue 0.907. E2c table vs measured per-material vertex: 0.041 (terrain FID). Inference, not measured: the claim that the cracks would show is not rendered.
  refuteBy: Show a per-material vertex definition that is local to the seam and keeps the vertices within about 0.1 of each other while staying on the surface.
  evidence: teams/table/logs/analyze.log, ../../src/core/mesh/mesher.ts

- [T11] (optimization, measured) At mesh time, a direct table indexed by the rank of the corner's restricted-growth string costs 63,441 bytes and adds about 0.14 ms per 32^3 chunk. The table has 21,147 entries of 3 int8 offsets in 1/256 block, already transformed so no symmetry runs at mesh time. In Node on this machine, over the 16 bench chunks (2,972 surface corners per chunk on average), reading the 8 blocks only takes 0.425 ms per chunk and rank plus lookup takes 0.562 ms, i.e. +0.137 ms. The complete no-volume table (all 551 surface classes) computed in 107 s (FID) and 51 s (FINITE) at n=12. Of those entries, 7 (FID) and 6 (FINITE) are clamped to the cell boundary; they account for 0.09% of sampled corners. An offset of 0.5 does not fit int8 at 1/256, so offsets clamp at ±0.496.
  numbers: A per-material layout would need 56,674 material slots on surface patterns, 170,022 bytes.
  refuteBy: Port the lookup into the repo mesher and measure more than about 1 ms per chunk on the bench chunks.
  evidence: teams/table/logs/lookup-bench.log, teams/table/logs/tablesize.log, teams/table/logs/table-clamp.log, teams/table/res/table/FID-0.15_E2c_n12_clu-novol.json, teams/table/logs/classsim-FID-0.15-E2c-n12-clu-novol-allsurf.log

- [T12] (limitation, measured) Same-material diagonal contacts carry a disproportionate share of the table's error, because the union decision depends on connectivity outside the 2x2x2. Under FID-0.15, classes 97, 27 and 92 make up 5.6% of terrain corners but 18.8% of the no-volume table's total error. Class 27 (two blocks touching along an edge, the rest air) has mean error 0.80. Uniting same-material bubbles in the embedding ('mat' semantics) does not fix class 97 under FID: it gives -0.027 per axis against a terrain mean of -0.139.
  numbers: 'mat' vs 'clu' table entries: mean difference 0.029 over 65 ambiguous classes (FID), frequency-weighted 0.010. Under FINITE-4 classes 92 and 27 have errors 0.241 and 0.386.
  refuteBy: Add a union bit computed from connectivity in the mesh apron and show the ambiguous-class error falls to the level of the other classes (about 0.06).
  evidence: teams/table/logs/contrib.log, teams/table/res/table/FID-0.15_E2c_n12_mat-novol.json, teams/table/logs/analyze.log

- [T13] (engine, measured) Engine resolution limits. FID-0.15 is fully pinned at n=8: E2c runs show zero label changes for classes 1, 2 and 10, so the vertex comes only from the render blur. n=12 and n=16 move. For FID, E2c tables at n=12 and n=16 differ by a mean of 0.006 over the top 12 classes. FINITE-4 vertices grow with n and have not converged by n=20: the convex corner (class 1) moves 0.133 / 0.204 / 0.243 / 0.261 per axis at n=8 / 12 / 16 / 20, and n=12 vs n=16 tables differ by 0.030 on average (max 0.128). All comparisons here are at a fixed n=12, the largest that fits 9x8x9 terrain windows in the memory limit.
  numbers: Convex edge (class 2) under FINITE-4: 0.040 / 0.081 / 0.121 / 0.138 per axis at n=8 / 12 / 16 / 20.
  refuteBy: Run the same classes at n=24 or more (on a smaller box) and show that FINITE-4 converges by n=16.
  evidence: teams/table/logs/conv-fid-e2.log, teams/table/logs/conv-finite-e2.log, teams/table/logs/conv-fid.log, teams/table/logs/analyze.log

- [T14] (engine, measured) Measurement floor: the same world corner measured in two terrain windows shifted by (2,0,2) gives reference vertices 0.023 apart on average (FID-0.15) and 0.022 (FINITE-4), over 128 corners. Table errors below about 0.02–0.03 cannot be resolved with 9x8x9 clamped windows and a 2-block guard.
  numbers: FID: p90 0.053, max 0.089. FINITE: p90 0.044, max 0.430.
  refuteBy: Repeat with larger guards or windows; if the twin difference rises well above 0.03, the window floor is underestimated.
  evidence: teams/table/logs/analyze.log, teams/table/res/scenes/terrain_FID-0.15_n12.json

## optimizations
- For terrain, replace physics with a per-corner table: no-volume canonical-embedding offsets for all 551 surface classes, indexed directly by the rank of the corner's restricted-growth string, with offsets pre-transformed (21,147 x 3 int8, 63 KB).
  basis: ['T3', 'T5', 'T7', 'T11']; gain: Terrain vertices within 0.059 (FID) / 0.038 (FINITE) block mean of the full simulation, against 0.136 / 0.121 for the current bevel rule and 0.208 / 0.256 for blocks. Cost about +0.14 ms per chunk; no simulation at mesh time.; risks: Wrong for small isolated objects (catalogue error 0.153 / 0.168) and for ambiguous diagonal unions (T12). FINITE-4 absolute values depend on n (T13). The table must be frozen for golden hashes, so whatever n and regime it is built at becomes permanent.
- A two-level table: a 22-entry solid/air table for single-material corners, plus a material-aware table only for seam classes.
  basis: ['T3', 'T8']; gain: 88.8% of terrain surface corners need only the 22-entry table. In cross-validation K8bin costs only +0.012 mean error over K8 (0.047 vs 0.035).; risks: Seam grooves and seam position come only from the seam table. Builds have 25.7% multi-material corners, so they lean on it more.
- Key the table on K8 plus a bubble-size or pressure bucket (size of the face-connected cluster within the mesh region, saturating), not on a larger neighbourhood.
  basis: ['T6', 'T7', 'T5']; gain: Could close the gap between terrain (no-volume table best) and small objects (volume or E1m table best): catalogue error 0.15 down toward about 0.07. Untested; inference.; risks: Needs a flood fill per mesh job; the 38^3 or 52^3 region bounds the size measure; the extra key multiplies table size by the number of buckets.
- Do not pursue 32- or 64-block keys or hashed window keys.
  basis: ['T7']; gain: Avoids tables that cover 5–33% of new corners for no gain once a fallback is used.; risks: Based on 3,115 corners from 51 windows of one seed; a much larger training set could raise coverage.
- Resolve same-material diagonal contacts with an explicit union bit, computed from connectivity in the apron, then look up the table.
  basis: ['T2', 'T12']; gain: Targets the classes carrying 18.8% of the no-volume table's FID error on 5.6% of corners; non-Plateau corners are 12.3% of terrain surface corners.; risks: The 'mat' experiment shows uniting in the embedding alone does not reproduce terrain for class 97 under FID; the bit must select a separately simulated or learned entry.
## open
- Is pressure about 0 the right model for huge terrain bubbles? The per-bubble lambda in the terrain windows was not recorded (T5 is partly inference).
- Would a size or pressure bucket in the key close the catalogue gap without hurting terrain? (optimization 3, untested)
- FINITE-4 vertices have not converged in n by n=20. At what n should a frozen table be built, and how much would entries move?
- Seam distances for the data-driven tables were not measured: seam points were not stored per corner, so only the reference-vertex error bounds them.
- All geometry is on the render field D (re-blurred labels, which rounds creases by about 0.1 block). Would label-based geometry change the class-11 seam numbers?
- 'World' clusters use a 12-block apron around each window. Are there same-material bubbles connected only further away that would change the union in ambiguous classes?
- Only seed [1,1]: 448 chunks for frequencies, 51 windows (3,115 corners) for simulations. Do other seeds or biomes (beaches, sand) shift the class shares?
- Three FID terrain windows (t1a-shift, t11b, t5a) reached 150 steps without converging; their vertices may be slightly off equilibrium.
## images
- teams/table/sheets/class-table-FID-0.15.png: The 12 most frequent surface corner classes (key = canonical RG string; share = mean of the terrain-wide, bench16 and builds samples), each simulated in the infinite-octant embedding E2c, FID-0.15, n=16, turned air side up. Straight edges stay nearly sharp; corners round.
- teams/table/sheets/class-table-FINITE-4.png: The same 12 classes under FINITE-4 (E2c, n=16): edges round within 4 steps; two-material seams (classes 11, 12, 14, 119) shown in blue/red.
- teams/table/sheets/context-embeddings.png: Context dependence: classes 1, 2, 95, 249, 97 and 11 under FID-0.15 n=12 in three embeddings: the 8 blocks alone (E1m), a 4^3 object in air (E2m), infinite octants (E2c). The same 2x2x2 gives very different corners (frequency-weighted table difference E1m vs E2c 0.199 block).
- teams/table/sheets/overlay-terrain.png: Terrain windows (seed [1,1], n=12, FID-0.15 and FINITE-4): sim cross-section at a lattice z plane, with corner vertices from the sim (white), the volume table (red), the no-volume table (orange) and the bevel rule (cyan). On grass staircases the no-volume table follows the rounded sim surface; the volume table keeps sharper corners.
- teams/table/sheets/overlay-builds.png: Builds (checker floor, house wall with window, painted 1-wide diagonal line, 1:1 stairs, stone wall) under FID-0.15 and FINITE-4 at n=12, same colour key. The bevel rule (cyan) turns stairs into a slope; the sim and the tables keep the steps.
- teams/table/sheets/overlay-cat.png: Catalogue configurations (stairs, terrain-step, ball-AB, tunnel) under FID-0.15 and FINITE-4 at n=12, same colour key: on small isolated objects the no-volume table (orange) is the worst rule (mean 0.153 / 0.168).
- teams/table/img/overlay/terrain-t0s-FID-0.15-z55.png: Terrain window t0s (seam window: grass over dirt over stone, 1:1 staircase slope), FID-0.15, n=12, z=55: white sim vertices, red/orange table vertices, cyan bevel.
- teams/table/img/overlay/builds-b-painted-FINITE-4-z7.png: The owner's hard case, a painted 1-wide diagonal brick line in a stone floor, sliced across the line, FINITE-4, n=12: the sim puts a groove at the seams, which the table vertices follow.
report: teams/table/logs/analyze.log