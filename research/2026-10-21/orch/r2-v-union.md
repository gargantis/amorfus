# v-union

I attacked the combined X-junction claim and 15 related claims. I re-ran the engine (lib/mbo.mjs) and the exact 2D solver (teams/phys/foam2d.mjs, imported read-only) on new configurations built so that the 4x4 window count, the cluster size and the instantaneous pressure disagree: W1 (bars joining blobs against 2x2 squares), L2 and L2-shortA (a domino line crossing a single-block line), LX lines of unequal length, a line with a blob at its end, a line in a dither, mixed-material X's over g and blur, and 3D cases. Each was run in the 8 square symmetries, in reversed block order and with frozen and annealed noise, in FREE, FINITE-4 and CAGE-0.25, and at several n and s. Four parts survive: an X is never an equilibrium; a solid pair facing an air diagonal always unites; the painted diagonal line connects (its blocks' step-1 λ is about 4.7 times the halves'); and the lower-tension rule holds in the exact solver. Rule4 is refuted: in W1, L2, L2-shortA and LX-10x4 the engine contradicts it 12 of 12 times in every regime, and the exact solver contradicts it in W1 and L2. The reading of 'higher pressure' as 'smaller cluster' is refuted: in L2-shortA the larger dominoes win, and in LX-10x4 and LX-8x2 equal sizes are still decided. What the engine actually follows is its step-1 λ (9 of 9 configurations). That λ depends on corner structure within 1-2 blocks and on g, and at near-ties the engine and the exact solver disagree, so those cases are design choices, not physics. The engine also breaks the tension rule whenever the alternative is solid-solid adhesion across a corner. 'Corner-only never unites' holds only without noise. Prior's annealing protocol merges every same-material contact at step 1, so it cannot be used to test union rules. All files are in teams/v-union/ (notes-summary.json indexes them) and are backed up.

- [combined: an X is never an equilibrium] CONFIRMED
  corrected: True of the physics. The engine's persistent X's are artefacts, and they also occur in 3D for frozen seeds.
  numbers: The exact solver splits every X it is given, including exact ties after the hold. The engine keeps an X only at exact symmetry (LX-6x6, jitter 0: 9/9 none) or in frozen pinned states (cube2-checker, jitter 1e-3 seeds 4 and 5: X lines 2.125 blocks per axis).
- [combined: the lower film tension gets the central film] PARTLY
  corrected: This is first-order physics, and it holds in the exact solver for every mixed X tested. The engine (and so every engine picture) breaks it whenever the alternative is solid-solid adhesion across a corner. Whether different solids may adhere across a corner is therefore a design choice.
  numbers: Exact solver, all as the rule predicts: ABAC (12-block A pair against single B and C) gives A at g 0.1/0.3/0.6/1; air-A-air-B separates at g 0.25-1.5; ABC-air gives B|C at g 0.6/0.9/1 and A|air at g 1.1/1.3. Engine: it adheres air-A-air-B at s 0.2 for every g (films 2.031/1.906/1.563/1.094 blocks) and at s 0.1 for g 0.25/0.5. In ABC-air it forms a B|C film at g 1.1/1.3 at both s (0.64-1.06 blocks).
- [combined: on a tension tie the higher-pressure pair (the smaller clusters) connects; equal sizes are a true tie] REFUTED
  corrected: The deciding quantity is the instantaneous pressure. It is set by the corner structure within 1-2 blocks (corners that are X junctions lower it), by g, and by neighbouring X's that resolve at the same time; it is not set by cluster size. Clear contrasts are physics: singles against halves of 15 or more blocks, 2x2 against a 12-block bar-and-blob. Near-ties are method-dependent and should be treated as design choices. In 3D a tie can resolve as 'both' by layering.
  numbers: L2-shortA (2-block dominoes against 1-block singles): the engine picks A (the larger pair) 12/12 in each of FREE, FINITE-4 and CAGE-0.25, and 3/3 at n 64, n 128 and s 0.1. LX-10x4 (all singles, so sizes are equal): engine B 12/12 per regime; exact solver A 64/64, although its pre-split rates tie (1.41422 against 1.41421). LX-8x2: B in both methods. The higher step-1 λ pair connects in 9/9 configurations (L2-shortA: A 0.0624 against B 0.0542). L2 flips from B to A when g goes from 1 to 1.5 (3/3).
- [combined: edge contacts with air always unite; corner-only contacts never do] PARTLY
  corrected: The air-X part is confirmed. 'Corner never' is a property of the noiseless dynamics, so it is a rule choice.
  numbers: Air X: the solid pair unites in every run (exact diag-edge 8/8 orientations, all line air-X's, annealed runs too). Corner-only: no union in any deterministic run. Under prior's annealing it merges at step 1 in 3/3 diag-corner and 3/3 cube2-cornerA; with merging deferred, 3/3 in each case including cube2-corner4.
- [combined: the painted 1-wide line connects because its one-block bubbles have higher pressure] CONFIRMED
  numbers: Step-1 λ: line blocks 0.058-0.060 against halves 0.0125 (engine); 0.64-0.78 against 0.27 (exact). All 5 X's go to A in 12/12 variants. The line also wins in lineToBlob, in the line through a B/C dither (7 X, 12/12) and in the line flanked by single-block lines (7 X, 12/12).
- [combined / local L17: rule4 (window minority, ties none) matches the physics] REFUTED
  corrected: The window count fails whenever the cluster at the X is thin inside the window but large outside it (W1), and at near-ties. A deterministic table is still possible, but it would be a tie policy chosen by design, not a match to the physics.
  numbers: W1: rule4 says A (window 4 against 8); the engine gives B in FREE 12/12, FINITE-4 9/9 and CAGE 9/9, in 3D 4/4 and in 3D two layers high 4/4; the exact solver gives B 64/64. L2: rule4 says none (4 against 4); engine B 12/12 per regime, exact B 64/64. L2-shortA: rule4 none, engine A 12/12 per regime. LX-10x4: rule4 none, engine B 12/12 per regime. Rule4 agrees on LX-8x2, LX-6x6, slab-line, lineToBlob, the line in the dither and the flanked line.
- [phys C6] PARTLY
  corrected: X's split at once. On a tension tie the engine connects its higher step-1 λ pair. The gloss 'the smaller cluster; air = 0' is wrong at near-ties, and the solver's tie decisions there depend on event order.
  numbers: W1, L2, LX-8x2, checkerSmallA and slab-line confirm it. L2-shortA: before any split the exact pressures are B 0.455 > A 0.403 and the pre-split rates favour B (1.41449 against 1.41394), yet the exact solver picks A in 48/64 settings, after splitting the B line's air-X's in the same scan. The engine picks A 12/12.
- [phys C7] PARTLY
  corrected: In 2D the engine keeps the X at exact ties. In 3D, cube2-checker resolves at jitter 0 but freezes with all six X lines for 2 of 5 frozen-jitter seeds.
  numbers: LX-6x6, jitter 0: none 9/9. sq2-checker 3D, jitter 0: X line 1.375. cube2-checker, jitter 0: both united at steps 12-15. cube2-checker, jitter 1e-3 seeds 4 and 5: frozen at step 14 with 8 bubbles and X lines of 2.125 blocks per axis.
- [phys C8] CONFIRMED
  numbers: checker-smallA: picked outcome E 12.91609 against forced B union 12.24332 (reproduced). L2-shortA: picked 30.948 against forced 29.132 (not converged). W1: the picked outcome is also the lower one (32.05 against 34.19).
- [phys C11] PARTLY
  corrected: Confirmed at g 1. The blur rule is not general. For g > √2 only separation lowers the energy at the X, yet the engine still adheres at s 0.2.
  numbers: g 1: the engine adheres at s 0.2 (film 1.563) and separates at s 0.1 (0); the exact solver separates. At s 0.1 the engine adheres for g 0.25/0.5 (1.844/1.766). At s 0.2 it adheres at g 1.5 (1.094), where the first-order adhesion rate is -0.086.
- [phys C12] PARTLY
  corrected: The final FREE topology is not fixed by the junction-resolved contact graph and the volumes. FREE adds later unions, and a blob touching only the line's end changes what happens to the far B halves.
  numbers: lineToBlob: the A line unites at step 1 and the B halves unite at step 42 (12/12 variants). In slab-line, without the blob, the B halves stay as 2 bubbles.
- [local L15] PARTLY
  corrected: True for the isolated 2x2-checker family that was tested; false in general. The painted-line part is confirmed.
  numbers: L2-shortA: the larger pair wins 12/12 in each of FREE, FINITE-4 and CAGE-0.25. LX-10x4 and LX-8x2 (equal sizes): with jitter 0 and with reversed order, B 9/9 per regime.
- [local L16] PARTLY
  corrected: The edge-with-air part is confirmed. Corner-only 'never' holds only for noiseless runs.
  numbers: Corner-only pairs unite under re-drawn noise 0.1: diag-corner 3/3 and cube2-cornerA 3/3 at step 1.
- [local L18] PARTLY
  corrected: The first part is confirmed. The neck widths depend on resolution: FINITE-4 at n 12 is below the claimed 0.5-1.0.
  numbers: FID-0.15 with the union imposed: necks [0,0,0,0,0] at n 12 and n 20. CAGE-0.25 at n 12: 0.667 at every X, also with B imposed. FINITE-4 at n 12: 0.417, and 0.167 with B imposed.
- [look L8] PARTLY
  corrected: Valid for the protocols that were run (jitter ≤ 1e-3).
  numbers: Edge-in-air and checker behaviour match in FREE, FINITE and CAGE. The 0-of-60 corner-only result does not hold under re-drawn noise (3/3 and 3/3 unite).
- [look L9] CONFIRMED
  numbers: Seed 2: B connected for y below 0.47 and A for y above 0.53 (reproduced). Layering also in seeds 3 and 5 and in deferred-merge anneals 3/3. Seeds 1 and 4 merged phases that ended in 2 pieces (artefact).
- [look L13] CONFIRMED
  corrected: The 'smaller bubble wins' reading does not generalise (see L2-shortA).
  numbers: Line λ is about 4.7 times the halves' λ in the engine and about 2.6 times in the exact solver; A wins 12/12 at every X.
- [prior x-rule-per-edge] PARTLY
  corrected: Correct as first-order physics. The engine breaks it for solid-solid adhesion. A-air-A-air ties in tension but is always decided (air pressure 0).
  numbers: The exact solver follows the rule for ABAC, air-A-air-B and ABC-air at g ≠ 1. The engine gives the B|C film at g 1.3 and adheres air-A-air-B up to g 1.5.
- [prior x-fixed-point] PARTLY
  corrected: The cross is a fixed point when tensions AND pressures are equal, or when the volume solve is off; equal tensions alone are not enough.
  numbers: Equal quadrants: 0 changes after 5 and 60 steps (reproduced). ABCD 3/2/2/1 (λ_D 0.0956 against 0.0624): 89 changes within 1 block after 5 steps, and the cross is gone by step 60. 3/2/2/2 at g 1, where λ quantises equal: still 4 phases at the cross after 60 steps.
- [prior annealed-noise-fix] PARTLY
  corrected: It works for 4-material X's, and re-drawing the noise is what matters. With same-material phases it merges every contact at step 1, so it cannot decide union questions.
  numbers: sq2-ABCD: anneal seeds 6-15 resolve 10/10 (walls 0.56-0.63 blocks). Frozen 0.1: X in 1/5, stubs of 0.125 blocks or less in 4/5. W1: both pairs merge at step 1 at amplitudes 0.01, 0.03 and 0.1 (5/5 each), leaving A in 2 pieces. Corner-only pairs merge at step 1 (6/6).
## new findings
- The exact 2D solver (foam2d) has an orientation bias of about 1.6e-3 in split rate. On an exact mirror tie (LX-6x6) its decision follows the orientation (4 of 8 symmetries each way). At near-ties its decisions come from event order: it splits the neighbouring air-X's and remeshes in the same scan before deciding the crossing. Solver tie decisions therefore need symmetry and pre-split checks.
- Engine decisions at tension-tied X's always follow the step-1 λ (9/9 configurations), and λ is set by local corner structure: a block whose corners are X junctions gains volume there and gets a low λ. This explains why singles inside a line can lose to dominoes, and why decisions change with g (L2 at g 1.5 flips to A).
- The engine and the exact solver disagree on LX-10x4 (engine B 12/12 in every regime, n and s; exact A 64/64, from a pre-split dead tie). Near-tie outcomes are method-dependent, so they are design choices.
- Prior's annealing protocol makes same-material contacts merge at step 1. Both pairs at a 2D X merge (one phase then ends in 2 pieces), and corner-only pairs unite. With merging deferred, FREE rearrangement unites everything that touches. No noise protocol tried here can arbitrate union rules.
- cube2-checker with frozen jitter 1e-3, seeds 4 and 5, freezes at step 14 with 8 separate bubbles and all six X lines, and the run reports converged. This refutes phys C14's 'cube2-checker always resolved'. At jitter 0 it resolves with both pairs united.
- In FREE, unions keep happening after the junction decision. In lineToBlob the B halves unite at step 42 once the line and blob ball up; without the blob (slab-line) they stay apart. Adding blocks that touch the line only at its end corner changes the topology of the far background.
- In 3D a tied crossing can resolve as 'both' by layering. This happened in the vertical LX crossing (seed 2), in sq2-checker (3 frozen seeds and 3/3 anneals) and in cube2-checker (jitter 0). A per-edge rule that says 'ties: none' cannot express this outcome.
- Under FID-0.15 the painted-line physics run merges A phases in bookkeeping (6:2 twice at n 12 and n 20) while 6 geometric dots remain, the C9 artefact in an anchored regime.
## open
- What does sharp-interface physics pick at near-ties such as LX-10x4 and L2-shortA, with all X's resolved simultaneously? This needs a solver without remesh-order effects, or a t→0+ asymptotic analysis of the corner-driven pressures.
- Can a local proxy for the engine's step-1 λ (free-corner turning against volume gained at X corners, per cluster) predict decisions beyond the 9 configurations tested? This is untested inference.
- Tie policy, which is the owner's call: at near-ties and exact ties, which pair connects? And should 3D ties be allowed to resolve as 'both' (layered)?
- Should different solids adhere across a corner contact, as the engine renders them at the default blur, or separate, as physics does? The question applies to air-A-air-B and to ABC-air at g > 1.
- Should FREE-like late unions (lineToBlob, step 42) be part of any game rule, given that they make the topology depend on blocks far from the X?
## images
- teams/v-union/img/v-union-sheet.png: Contact sheet, 16 labelled panels; colours are engine labels, white lines are the exact 2D solver's films. Panels: W1 blocks and result (B 2x2 squares unite against rule4); L2 (B singles cut the domino line); L2-shortA (the larger dominoes unite); LX-10x4 (engine B against exact A); diag-edge-diff at g 1.5 (engine adheres, exact separates); L3-ABC at g 1.3 (engine B|C film, exact B and C apart); W1 under prior's anneal (both merged, A in 2 pieces); cube2-checker seed 4 frozen against jitter 0 both united; sq2-checker 3D layering at y 0.15 and 0.85; diag-corner united under annealing.
- teams/v-union/img/W1-engine12.png: W1, 2D FREE n32, 12 steps: the 2x2 B squares unite at the X, against rule4's A; the exact films (white) agree.
- teams/v-union/img/L2shortA-engine12.png: L2-shortA, 2D FREE n32, 12 steps: the 2-block A dominoes unite across a line of 1-block B singles, so the larger pair wins.
- teams/v-union/img/LX104-engine12.png: LX-10x4, 2D FREE n32: the engine cuts the A line (B unites); the exact solver's films (white) show A united, a method-dependent near-tie.
- teams/v-union/img/cube2chk-s4.png: cube2-checker, FREE n16, jitter 1e-3 seed 4, plan at y 0.5: frozen with 8 bubbles and the X kept.