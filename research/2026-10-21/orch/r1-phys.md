# TEAM phys

I tested lib/mbo.mjs (FREE regime) three ways: against closed-form bubble geometry (exact.mjs), against an independent 2D foam solver I wrote (foam2d.mjs), and over the whole catalogue plus 8 extra configurations, with jitter 1e-3 and seeds 1 and 2. The solver uses polyline films, Lagrange-multiplier area constraints and T1 splits. Against the closed forms it reaches 2e-4 relative energy at h 0.04 and 5e-5 at h 0.02, junction angles of 120 ± 0.09°, and pressures within 0.03 % (cross2d/solvercheck.json).

The engine is trustworthy for single bubbles and small clusters:
- Sphere radii are within 0.2 %, and its pressure follows Young–Laplace, λ = (2/R)·s_b/√(2π), to 1–3 %.
- Two-cluster results match the exact double bubble to a few percent.
- 2D interfaces converge to the exact films (mean 0.002 blocks at n 128).
- Bubble–bubble–bubble junctions measure 120.0 ± 0.6°.

It is not trustworthy in five places:
- **Blur width:** its limit at fixed blur s is a slightly different model. The junction circle is +6 % at n 32 and s 0.2, and +10–12 % at s 0.3. Junctions involving air are too wide: about +9° at s 0.2 and about +20° at s 0.3.
- **Pinning:** it stalls whenever a bubble's radius exceeds R_pin = 2·s_b²·n (1.28 blocks at the default n 16, about 9 blocks of volume). Large clusters stay as rounded boxes, and walls with a radius above R_pin stay flat on lattice planes.
- **Exact ties:** it keeps unstable four-fold junctions, always for four materials and for a symmetric checkerboard without jitter.
- **Merges:** a merged phase can split into disconnected parts that share one pressure.
- **Contact rule:** for two materials touching along an edge it adheres at s 0.2 and separates at s 0.1.

On the physics:
- Lattice four-fold junctions always split at once, and the diagonal pair with the higher pressure (the smaller cluster; air counts as 0) becomes connected. The engine follows this in every unequal case: 16 of 16 runs in 2D and 4 of 4 in 3D.
- This local rule can pick a higher-energy end state than the global minimum: 12.916 against 12.243 in checker-smallA.
- Chains of three bubbles have a neutral bending mode.

With these corrections, pattern (a) holds: cluster graph plus volumes decides, once lattice junctions are resolved by the pressure rule, up to that bending mode and exact ties. Pattern (b) holds except at engine-pinned exact ties. Pattern (c) holds: sphere, double-bubble and triple-bubble formulas predict the small results without simulating.

The deliverable REPORT.md was not written: the harness refused writing a report .md file, so the full report is carried in this result. All data, scripts and images are in teams/phys/, backed up to <backup>/teams/phys/.

Method notes:
- lib/ was not edited.
- One heavy node process ran at a time, with --max-old-space-size=700.
- Grids stayed at or below 1.15 M cells. Three big scenes ran at n 12: ball-r2, ball-AB and terrain-step.
- 361 raw renders were deleted to keep 22 images; the scripts regenerate them with fixed seeds.

- [C1] (engine, measured) Single bubbles are right: the radius fitted to the final labels of a 1-, 2- and 8-block FREE bubble is within 0.2% of (3V/4π)^(1/3) at every tested setting with s_b ≥ 0.2 (n 12–32). The engine's pressure (volume multiplier λ during the run) obeys Young–Laplace in engine units, λ = (2/R)·s_b/√(2π), to within 1% for V ≤ 3 and 3.2% for V ≤ 8.
  numbers: V1 at n16: R fit 0.6205 vs 0.6204, λ 0.2575 vs 0.2572. V8 at n32: R 1.2411 vs 1.2407. Catalogue λ errors: single −0.9%, pair-same +0.6%, line3 −0.3%, sq2-same +2.4%, plus5 +3.2%, cube2 +1.2%, ring8 −0.5%.
  refuteBy: A FREE bubble with V ≤ 8, s_b ≥ 0.2 and n ≥ 12 whose fitted radius is off by more than 1%, or whose λ is off by more than 5% from (2/R)·s_b/√(2π).
  evidence: teams/phys/val3d/n16-s0.2.json, teams/phys/val3d/n32-s0.2-m0.5.json, teams/phys/laws/sphere-lambda.json

- [C2] (limitation, measured) At fixed blur the engine converges to a slightly wrong model, not to exact physics. Holding s_b = 0.2 and raising n, the equal double bubble's junction circle moves further from the exact value (+3.0% at n16, +6.4% at n32). At s_b = 0.3 it is +10–12%. Away from junctions the 2D shapes do converge to the exact films.
  numbers: pair-diff junction radius a (exact 0.5685): 0.586 (n16, s.2), 0.602 (n24, s.2), 0.605 (n32, s.2), 0.627 (n16, s.3), 0.636 (n24, s.3). Wall-to-tip (exact 0.9847): 1.000 / 0.958 / 0.968 / 0.938 / 0.958. 2D mean / max distance to the exact films: 0.018/0.040 (n32), 0.0037/0.013 (n64), 0.0020/0.014 (n128).
  refuteBy: An n ≥ 48 FREE pair-diff run at s_b 0.2 whose label-measured junction radius is within 2% of 0.5685.
  evidence: teams/phys/val3d/n16-s0.2.json, teams/phys/val3d/n24-s0.2-m0.5.json, teams/phys/val3d/n32-s0.2-m0.5.json, teams/phys/val3d/n16-s0.3.json, teams/phys/val3d/n24-s0.3-m0.5.json, teams/phys/cross2d/pair-diff.json

- [C3] (limitation, partly-measured) Junction angles are right where three bubbles meet (120.0 ± 0.6°). Where air is one of the three phases, the engine's air sector is too wide, and the excess grows with the blur: about +9° at s_b 0.2, +20° at s_b 0.3 and +3° at s_b 0.1, judged against the same tool applied to the rasterised exact solution. The distortion is confined to a zone of about s around the junction.
  numbers: 3D L3-ABC A|B|C junction at n32: 119.97 / 120.62 / 119.41°. 2D pair-diff air sector: 128° (n128, s.2) against an exact-raster reading of 117.9°; 130° (n64, s.3) against 110.0°; 121° (n128, s.1) against 117.9°. 3D fitted-sphere air sector: 117–125° at s.2, 129–133° at s.3. At n ≤ 32 the measuring tool is biased −8 to −25° on air sectors.
  refuteBy: An n128 s_b 0.2 2D engine run whose air sector, measured with labtools.anglesAt (rOut 0.35), is within ±3° of the calibrated exact reading of 117.9°.
  evidence: teams/phys/val3d/n32-s0.2-m0.5.json, teams/phys/cross2d/L3-ABC.json, teams/phys/cross2d/pair-diff.json, teams/phys/cross2d/anglecal-r0.35.json, teams/phys/cross2d/anglecal-r0.5.json

- [C4] (physics, partly-measured) Where four bubbles meet at a point, the engine forms isolated tetrahedral vertices as Plateau requires. L3-ABC becomes the standard triple bubble with exactly two compact 4-phase points. The 109.47° angle is consistent only on average and is not resolved at affordable n.
  numbers: Angles between triple lines at n32: 113.7, 116.1, 96.2, 121.5, 102, 101.3 (mean 108.5°). At n24: 90–124° (mean 107.9°).
  refuteBy: A higher-resolution measurement (n ≥ 48, cropped box, or a 3D surface solver) whose mean differs from 109.47° by more than 5°, or one showing a 4-phase line instead of points.
  evidence: teams/phys/val3d/n32-s0.2-m0.5.json, teams/phys/val3d/n24-s0.2-m0.5.json

- [C5] (engine, measured) Pinning law: one MBO step moves an interface by about κ·s²/2 and stalls below a sub-cell of motion. A flat face therefore advances only if 2/R > 1/(s_b²·n). Bubbles with R > R_pin = 2·s_b²·n blocks (2D: s_b²·n) end as rounded boxes and are reported as converged. At default settings (n16, s 0.2) R_pin is 1.28, roughly 9 blocks of volume. Walls whose exact radius exceeds R_pin stay exactly planar on a lattice plane.
  numbers: Radial spread/R: runs with R/R_pin ≥ 1.45 give 0.20–0.31 (cube3 n16 s.2 0.203; cube4 0.241; n12 s.2 0.267 / 0.307). Runs with R/R_pin ≤ 0.97 give 0.03–0.07 (cube4 n16 s.3 0.030; cube3 n24 s.2 0.053). Runs at 1.15–1.29 give 0.089–0.094. Catalogue: tunnel V30 λ +43.6%, stairs V12 λ +5.9%. The 1:2 wall (exact radius 3.99 > 2.56) has plane rms 0 at n12–32. 2D slab-line at n32: mean / max 0.56/1.24 blocks from equilibrium, energy +7.0%.
  refuteBy: A FREE cube with R/R_pin ≥ 1.45 that reaches radial spread < 0.10, or one with R/R_pin ≤ 0.95 that stalls with spread > 0.15.
  evidence: teams/phys/pinning/results.json, teams/phys/laws/sphere-lambda.json, teams/phys/val3d/n32-s0.2-m0.5.json, teams/phys/cross2d/slab-line.json

- [C6] (physics, measured) Lattice four-fold junctions (a 2D corner or a 3D edge with four regions) are never equilibria. They split immediately, and the diagonal pair with the higher pressure (the smaller cluster; air counts as 0) becomes connected. This covers: same material across an air diagonal unites (diag-edge); three bubbles around air form a film between the corner-touching pair (L3-ABC); the slab-line A's unite into a band; the single-block pair unites in unequal checkerboards, whatever its material. The engine agrees whenever the pressures differ.
  numbers: The solver's split decision comes one step after the hold, e.g. slab-line A-A rate 1.4174 against B-B 1.4110; L3-ABC B|C 0.4171 against A|air 0.4113. The engine picks the same pair in checker-smallA and checker-smallB: 16 of 16 2D runs (n32 and n64, jitter 0 and 1e-3) and 4 of 4 3D runs. Also diag-edge 10/10, L3-ABC 10/10, and slab-line 2D 5/5 and 3D 2/2 (A band). Exact-film distance at n64 for checker-smallA: 0.011/0.028.
  refuteBy: Any exact-solver or engine run without an exact pressure tie in which the lower-pressure diagonal pair of a lattice four-fold junction becomes connected.
  evidence: teams/phys/cross2d/checker-smallA.json, teams/phys/cross2d/checker-smallB.json, teams/phys/cross2d/diag-edge.json, teams/phys/cross2d/L3-ABC.json, teams/phys/cross2d/slab-line.json, teams/phys/free/results.json

- [C7] (limitation, measured) At exact pressure ties the engine keeps the non-physical four-fold junction. sq2-checker with jitter 0 keeps its X at every n (32–128) and s_b (0.1–0.2). sq2-ABCD keeps it at every n and jitter tried, sitting on the unstable X-constrained stationary state. The true minimum has a film about 0.46 blocks long between one diagonal pair and different pressures. In 3D the X persists as a 4-fold line.
  numbers: sq2-ABCD solver energies: split 11.1884, X kept 11.2916 (+0.92%). Engine distance to the X state: 0.0022/0.0106 (n64), 0.0018/0.0125 (n128). Distance to the true minimum: 0.067/0.143. Engine pressures are uniform at 1.400 (n128); exact are 1.441 (B, C) and 1.357 (A, D). In 3D the 4-fold line has extent 1.25 blocks (both seeds), plus sq2-checker seed 1 at 1.375. With jitter 1e-3 the 2D checker unites one pair: A in 2 of 3 runs at n32, then B and A at n64, B at n128.
  refuteBy: An engine FREE run of sq2-ABCD (any n, jitter ≤ 1e-2) that ends with a film between a diagonal pair, or a jitter-0 sq2-checker run that unites a pair.
  evidence: teams/phys/cross2d/sq2-ABCD.json, teams/phys/cross2d/sq2-checker.json, teams/phys/free/results.json

- [C8] (physics, measured) Uniting is decided locally by pressures at lattice junctions, not by the global energy. In checker-smallA, physics and the engine both unite the single-block pair, giving energy 12.916, although uniting the two 2-block clusters would give 12.243. A 'minimise energy over cluster graphs' predictor would therefore be wrong.
  numbers: checker-smallA: rule outcome E 12.9158, forced B-union E 12.2433 (5.2% lower). In slab-line the rule outcome is also the lower one: 31.5168 against 39.5767.
  refuteBy: A time-dependent run (solver or engine at n ≥ 64) without an exact tie that reaches the B4 state from the checker-smallA blocks.
  evidence: teams/phys/cross2d/checker-smallA.json, teams/phys/cross2d/checker-smallB.json, teams/phys/cross2d/slab-line.json

- [C9] (engine, measured) The engine has two merge artefacts. (1) A merged phase can come apart into disconnected parts that share one volume and pressure, and is still counted as one united bubble. (2) Sub-cell noise can unite both diagonal pairs of a 2D checkerboard in a single step, which is impossible in a plane.
  numbers: sq2-checker 3D seed 1 merged at steps 24 and 27 and ended with both phases in 2 parts, a 4-fold line of extent 1.375 and 5-phase corners. slab-line 3D seed 2: B30 in 2 parts (B merge at step 34). 2D sq2-checker with jitter 1e-2, seed 4: 2 merges at step 1.
  refuteBy: Re-run sq2-checker 3D seed 1 and slab-line 3D seed 2 with a connected-components check after every merge: if no phase ever has more than one part, the claim is wrong.
  evidence: teams/phys/free/results.json, teams/phys/free/merge-timing.log, teams/phys/free/log.txt

- [C10] (physics, measured) A chain of three bubbles (A|B|A) has a neutral mode. Both outer arcs of the middle bubble lie on one circle, so rotating an end bubble about that circle's centre changes neither length nor any area. Chain shapes form a one-parameter family; bending is free until the ends touch and could then unite.
  numbers: From the solver polylines: B's outer arcs have centres (1.5, 0.502) and (1.5, 0.498), radius 0.69810 and 0.69808. Pressures are A 1.5650 and B 1.4345; 1/R_B = 1.4325. The wall radius fits 7.73 against 1/(pA − pB) = 7.66.
  refuteBy: A solver or engine run started from a bent A|B|A chain that returns to straight, or one whose energy depends on the bend angle by more than the discretisation error (about 1e-4).
  evidence: teams/phys/cross2d/line3-ABA.json

- [C11] (limitation, measured) Two different materials touching only along an edge (diag-edge-diff) is not decided by physics: both separating and adhering lower the energy. Steepest descent separates; adhesion leads to the lower-energy double bubble. The engine's choice depends on the blur: it adheres at s_b 0.2 and separates at s_b 0.1.
  numbers: Solver: separate, E 7.0907. Equal double bubble: 6.359 (exact.mjs). Split rates at the X: separate 1.414, adhere 0.414. Engine at s_b 0.2: adheres in 2D (n32, n64, n128; jitter 0 and 1e-3: 9/9) and in 3D (n16, 2/2). At s_b 0.1, n64: separates, distance 0.0066/0.019 to the separated solution.
  refuteBy: An s_b 0.2 engine run that separates diag-edge-diff, or an s_b 0.1 run that adheres.
  evidence: teams/phys/cross2d/diag-edge-diff.json, teams/phys/free/results.json

- [C12] (pattern, measured) Pattern (a) holds for physics, with qualifications: the free equilibrium is set by the contact graph after lattice junctions are resolved by the pressure rule (C6, C11) and by the volumes, up to neutral modes (C10). It is not unique at exact ties. The face-contact graph alone does not decide. The engine adds about 5% dependence on block arrangement through pinning.
  numbers: Same volumes 1:2 in four arrangements (row-ABB, L-ABB, L3-AAB, row-AAB): r1 0.670–0.676, r2 0.805–0.810, a 0.640–0.652. V3 spheres (line3, L3, pillar3): λ 0.1778 / 0.1778 / 0.1789. Counterexamples to the face graph alone: line3-ABA stays a chain while L3-ABA unites its A's (A2|B1); line3-ABC is a chain while L3-ABC is a triple bubble. Engine arrangement dependence: sq2-AABB against row-AABB, a 0.768 / 0.746 and length 2.372 / 2.498.
  refuteBy: Two block arrangements with the same contact graph after junction resolution and the same volumes whose exact (solver) equilibria differ by more than the neutral modes.
  evidence: teams/phys/doubles/results.json, teams/phys/free/results.json, teams/phys/cross2d/L3-ABA.json, teams/phys/cross2d/line3-ABA.json

- [C13] (pattern, measured) Pattern (c): for small clusters the free result is predictable without simulating. One cluster becomes a sphere of radius (3V/4π)^(1/3). Two face-touching clusters become the standard double bubble of the two volumes (exact.mjs: outer radii meeting at 120°, wall radius r1·r2/(r2 − r1) bulging into the larger bubble). Pressure goes as 1/R, and the smaller bubble has the higher pressure. This prediction fails for clusters beyond the pinning radius.
  numbers: For 15 two-cluster configurations with V ≤ 8 (n16): outer radii within −0.7% to +5.5% of exact, junction radius within +1.6% to +10.2%, λ within 4% of 2/r·s_b/√(2π). Pinned outliers: slab-dot (B24) r1 +65%; ball-AB at n12 r1 +13%.
  refuteBy: A two-cluster configuration with V ≤ 7 whose engine (n16, s 0.2) outer radii differ from the exact double bubble of the same volumes by more than 6%.
  evidence: teams/phys/doubles/results.json, teams/phys/exact.mjs, teams/phys/laws/sphere-lambda.json

- [C14] (pattern, measured) Pattern (b): in the FREE engine results, Plateau structure (sheets, triple lines, isolated 4-phase points) holds for 42 of 44 configurations. Junctions of four or more bodies appear as 4-fold lines and 5-phase corners only where four bodies sat symmetrically around a lattice edge (sq2-ABCD in both seeds, sq2-checker in seed 1). Eight blocks around a lattice vertex (cube2-checker, cube2-octants) always resolved.
  numbers: The census counts by connected component. Isolated points: L3-ABC 2, sq2-AABC 2, cube2-octants 5 (extent ≤ 0.063). Lines: sq2-ABCD extent 1.25 with hist[5] = 2; sq2-checker seed 1 extent 1.375. All other configurations have no corner with ≥ 4 bodies.
  refuteBy: Re-run the census (freecat.mjs) on any of the 42 'clean' configurations and find a 4-body component with extent > 0.25 block, or find a 4-fold line in the exact solver.
  evidence: teams/phys/free/results.json

- [C15] (look, measured) Seams between different materials stay on block faces in the engine at its default resolution, even where physics moves them by about 0.1 block. Examples: in 2D at n32 the A|B wall of a 1:2 double bubble and both walls of A|B|A stay on lattice lines, and in 3D the 1:2 wall stays exactly planar. This is pinning (C5), not physics, so 'boundaries stay on the lattice' in engine pictures must not be read as a bubble law.
  numbers: row-ABB 2D n32: mean / max 0.059/0.154 from exact, against 0.003/0.011 at n128. line3-ABA: 0.060/0.110 at n32, 0.005/0.014 at n128. Exact walls sit at x = 1.107 and 1.893 (solver junctions). 3D row-ABB wall plane rms 0 at n12, 16, 24 and 32.
  refuteBy: A 2D n32 s_b 0.2 run of row-ABB whose A|B wall is off the lattice line x = 1 by at least 0.1 block, matching the exact wall.
  evidence: teams/phys/cross2d/row-ABB.json, teams/phys/cross2d/line3-ABA.json, teams/phys/val3d/n32-s0.2-m0.5.json

## optimizations
- Skip simulation for small free clusters: compute the cluster graph and volumes, then place closed-form shapes (a sphere for one cluster, the standard double bubble from exact.mjs for two face-touching clusters).
  basis: ['teams/phys/doubles/results.json', 'teams/phys/laws/sphere-lambda.json', 'teams/phys/exact.mjs']; gain: A 1-D root find replaces 20–130 MBO steps (0.5–7 s per configuration at n16, doubles/results.json 'ms'). It is at least as accurate as the engine for V ≤ 8 and better beyond the pinning radius, where the engine is wrong by 13–65%.; risks: Valid only for the FREE regime, which destroys block shapes and is not a terrain look. Three or more clusters need the triple-bubble and chain solutions; chains have a neutral bending mode (C10). Lattice four-fold junctions must be resolved first (C6).
- Resolve every lattice four-fold junction before any smoothing with the pressure rule: connect the diagonal pair with the higher pressure (the smaller cluster; air = 0). Same material therefore always connects across an air diagonal at a shared edge. Same-material vertex-only contact separates. Exact ties get an explicit, deterministic design choice, such as the lower material id. This could be a per-corner table in the style of the bevel rule (PLAN.md 7.9) with a cluster-size comparison.
  basis: ['teams/phys/cross2d/checker-smallA.json', 'teams/phys/cross2d/sq2-ABCD.json', 'teams/phys/free/results.json']; gain: It removes the engine's persisting X junctions (C7) and its seed dependence at ties (C9), and it matches exact physics in every unequal case tested (16/16 2D and 4/4 3D runs, plus diag-edge, L3-ABC and slab-line). For the owner's painted-diagonal case it decides deterministically whether the line stays continuous.; risks: Pressure needs cluster size, which is non-local; a mesher job only sees a 38³ or 52³ region, so a local proxy (inference) would be needed and is untested. The rule can pick a higher-energy end state than the global minimum (C8), but that is what physics does. Ties and the different-material edge contact (C11) are design decisions, not physics.
- Choose engine settings by the pinning law. R_pin = 2·s_b²·n must exceed the radius of the largest bubble that should round. Raising s_b from 0.2 to 0.3 at n 16 raises R_pin from 1.28 to 2.88 at no extra grid cost. A stall detector should flag runs that stop with changes = 0 while some bubble has R > R_pin.
  basis: ['teams/phys/pinning/results.json', 'teams/phys/val3d/n16-s0.3.json']; gain: For the 64-block cube at n16, radial spread falls from 0.241 to 0.030 by changing s_b from 0.2 to 0.3. This avoids raising n, where cost grows as n³ (1.2 M cell cap).; risks: A larger s_b widens the junction error: the junction circle grows to +10–12% and the air angle to about 130° (C2, C3). A smaller s_b pins earlier. There is no setting that is both unpinned and junction-exact at affordable n.
- Two small engine fixes. After every merge, run a connected-components pass and re-split any phase that has come apart. Break exact symmetric X junctions deliberately, either by applying the pressure rule or by flipping one sub-cell toward the higher-pressure pair, instead of relying on jitter.
  basis: ['teams/phys/free/merge-timing.log', 'teams/phys/cross2d/sq2-ABCD.json']; gain: It removes the non-physical states seen in sq2-checker seed 1, slab-line seed 2 and sq2-ABCD (both seeds, 2D up to n128), making FREE results Plateau-clean.; risks: Re-splitting changes phase bookkeeping (targets, λ). A forced X split must choose an option at exact ties, which is a design choice.
- Use the independent 2D solver (foam2d.mjs) as ground truth for regression tests of any smoothing or seam rule evaluated on 2D slices.
  basis: ['teams/phys/cross2d/solvercheck.json', 'teams/phys/foam2d.mjs']; gain: Energy error 5e-5 at h 0.02, junction angles of 120 ± 0.09°, pressures within 0.03%, and 1–7 s per small case. It decides lattice-junction topology explicitly and reports both options.; risks: 2D only. Merging through an air gap (bubbles approaching without a shared film) is detected but not performed. It is research code, not deterministic across browsers.
## open
- Is the too-wide air angle (C3) intrinsic to volume-constrained threshold dynamics with an unconstrained air phase? A 2D run at s_b 0.05 with n ≥ 256 would separate the blur effect from pinning.
- Would a one-sub-cell seed toward either diagonal pair let the engine relax sq2-ABCD to its true minimum, and does it then reproduce the exact pressures (1.441 / 1.357)?
- Physics does not decide two cases: different materials touching only along an edge (separate or adhere), and exact checkerboard ties. Which choice does the owner want for painted seams? It must be stated as a rule.
- How should the pressure rule (C6) be approximated locally inside a mesher job, which sees only a 38³ or 52³ region, when the deciding cluster sizes are non-local?
- 3D neutral modes: does a slightly bent line3-ABA chain stay bent in the engine, and does a bend that lets the end bubbles touch make them unite?
- The tetrahedral 109.47° angle needs a better 3D measurement (n ≥ 48 in a cropped box, or a 3D surface solver) to test it to ±2°.
- REPORT.md was not written because the harness refused report .md files from this agent. If the orchestrator needs the file, it must be written from this structured result by an agent that is allowed to write it.
## images
- teams/phys/sheets/free-catalogue-1.png: Free foam, part 1: before / after / slice for single through sq2-AABC (FREE n16, jitter 1e-3, seed 1; the seed-2 outcome is in the label when it differs).
- teams/phys/sheets/free-catalogue-2.png: Free foam, part 2: sq2-ABCD through stairs (FREE n16). It shows the persisting 4-fold X of sq2-ABCD, diag-edge uniting against diag-corner separating, cube2-octants as a 4-bubble cluster, and ring8 closing to a sphere.
- teams/phys/sheets/free-catalogue-3.png: Free foam, part 3: row/L variants, L3-ABA, slab-dot/-line/-stripe, tunnel, ball-r2 and ball-AB (n12), terrain-step (n12), and checker-smallA/B (FREE). Pinned big clusters (tunnel box, lumpy terrain) and the pressure rule (the single pair unites) are visible.
- teams/phys/sheets/free-seeds.png: FREE n16, seed 1 against seed 2. sq2-checker: four-lobe artefact with merged-but-split phases against an A2|B2 double bubble. slab-line: the same shape, but B is one phase in two parts in seed 2.
- teams/phys/sheets/cross2d.png: 2D engine labels (colours) against exact solver films (white), FREE at n32/64/128, s 0.1/0.2, jitter 0 or 1e-3. It shows: walls stuck on lattice lines at n32; the persisting X of sq2-ABCD up to n128; random checker union; adhesion against separation in diag-edge-diff; the pressure rule in checker-small; pinned slab-line lobes.
- teams/phys/sheets/pinning.png: Pinning law: mid-slices of FREE cubes of 8, 27 and 64 blocks and the tunnel at (n, s_b) = (12, .2), (16, .2), (24, .2), (12, .3), (16, .3). Each is labelled with R, R_pin = 2·s_b²·n and radial spread; when R > R_pin the cubes stall as rounded boxes.
- teams/phys/free/sq2-ABCD-s1-view.png: sq2-ABCD, FREE n16 seed 1: four bubbles around a persisting 4-fold line junction (non-Plateau; exact physics splits it).
- teams/phys/free/sq2-ABCD-s1-slice.png: sq2-ABCD, FREE n16 seed 1, plan slice: an X where four films meet at 90°.
- teams/phys/free/sq2-checker-s1-view.png: sq2-checker, FREE n16 seed 1: four lobes remain although the engine merged both pairs (each phase in 2 parts), an artefact.
- teams/phys/free/sq2-checker-s2-view.png: sq2-checker, FREE n16 seed 2: both pairs united (possible in 3D), giving an A2|B2 double bubble.
- teams/phys/free/tunnel-s1-view.png: tunnel (stone 30), FREE n16 seed 1: stalls as a rounded box (R 1.93 > R_pin 1.28) instead of a sphere.
- teams/phys/free/L3-ABC-s1-slice.png: L3-ABC, FREE n16 seed 1, plan slice: a B|C film forms at the edge contact, giving the standard triple bubble (pressure rule with air).
- teams/phys/free/cube2-octants-s1-view.png: cube2-octants, FREE n16 seed 1: each same-material edge-diagonal pair unites, giving a 4-bubble cluster in which all six pairs touch.
- teams/phys/free/checker-smallA-s1-slice.png: checker-smallA, FREE n16 seed 1, plan slice: the two single A blocks (higher pressure) unite between two 2-block B bubbles.
- teams/phys/free/slab-line-s1-slice.png: slab-line, FREE n16 seed 1, plan slice: the six diagonal A blocks unite into one band between two B15 lobes.
- teams/phys/cross2d/sq2-ABCD-n128-s0.2-j0-seed1.png: sq2-ABCD, 2D FREE n128 s0.2: engine labels keep the X; the white exact films show the true minimum with an A|D film.
- teams/phys/cross2d/slab-line-n32-s0.2-j0-seed1.png: slab-line, 2D FREE n32 s0.2: same topology as exact (A band), but the B lobes are pinned boxy, mean / max 0.56/1.24 blocks from the exact films (white).
- teams/phys/cross2d/diag-edge-diff-n32-s0.2-j0-seed1.png: diag-edge-diff, 2D FREE n32 s0.2: the engine adheres A and B; the solver's steepest descent separates them (white circles).
- teams/phys/cross2d/checker-smallA-n64-s0.2-j0-seed1.png: checker-smallA, 2D FREE n64 s0.2: engine and exact films agree (0.011/0.028) on the single-block pair uniting.
- teams/phys/cross2d/row-ABB-n32-s0.2-j0-seed1.png: row-ABB (1:2), 2D FREE n32 s0.2: the engine's wall is stuck on the lattice line x = 1; the exact wall (white) sits right of it and curves into B.
- teams/phys/pinning/cube3-n16-s0.2-slice.png: cube3 (27 blocks), FREE n16 s0.2: R 1.86 > R_pin 1.28, stalls as a rounded box (spread 0.203).
- teams/phys/pinning/cube3-n16-s0.3-slice.png: cube3 (27 blocks), FREE n16 s0.3: R 1.86 < R_pin 2.88, rounds to a sphere (spread 0.043) at the same grid cost.
report: NOT WRITTEN: the harness refused REPORT.md (subagents may not write report .md files), so the full report is in this structured result. Data, scripts and images: teams/phys/ (backup: <backup>/teams/phys/).