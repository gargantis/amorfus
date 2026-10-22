# Bubble physics study, 2026-10-21

The owner asked: "I want to experiment with bubble physics. Basically, each
block acts like a bubble. Neighboring bubbles of differing material stay
separate, neighboring bubbles of the same type unite. Investigate how
different clusters combine to see if there are patterns that lead to
optimizations. Generate sample image for various configurations of bubbles."
This folder records the study that followed, run on 21–22 October 2026 against
`main` at `c27fa8b`.

**Status: findings, not decisions.** Nothing here is adopted, and nothing in
the game changed. The code is research code: `npm run check` does not build,
lint, type-check or test it, but its `public-scan` step scans every file here.

## Sample images

`samples/` holds 21 labelled contact sheets. Good starting points:

- `00-overview-blocks-to-bubbles.png`: six configurations as blocks, after a
  short relaxation, in a cage, under a fidelity anchor, and as free bubbles.
- `01`–`03`: every catalogue configuration under free bubble physics (before,
  after, cross-section).
- `04`–`06`: the spectrum from blocky to bubbly as the anchor weakens.
- `08`: the painted 1-wide diagonal line; `11`: where the best look breaks.

## The model

`lib/mbo.mjs` is multiphase threshold dynamics (MBO; Esedoglu and Otto 2015)
on a grid of n sub-cells per block. Every face-connected cluster of one
material is one bubble that keeps its volume through a per-bubble pressure λ.
Different materials meet across a film of tension g (1 = the cost of a
surface against air). Same-material bubbles that come to touch merge. Air is
the reservoir. Regimes: FREE (real bubbles, run to equilibrium), FINITE-T
(T steps from the blocks, then stop), CAGE-r (a bubble stays within its
blocks dilated by r), FID-k (a cost k per cell for leaving its original
bubble), NOVOL (no volume constraint, i.e. mean-curvature flow).
`HARNESS.md` documents the engine, regimes, calibration and known limits.

Engine accuracy, from team phys against closed forms and an independent exact
2D foam solver (`teams/phys/foam2d.mjs`): sphere radii within 0.2 %; the equal
double bubble's junction circle +3 % at n 16 and +6 % at n 32 with the same
blur; junctions involving air about 9° too wide at the default blur;
bubbles that start with flat faces pin once their radius exceeds about
2·s²·n blocks, while curved boundaries pin later (phys C2, C3, C5, not
reviewed; prior pinning-disks). Exact four-way ties persist in the engine
(phys C7, partly confirmed). The anchored
regimes are not converged in resolution: the FID-0.15 tunnel's clear height is
1.21 at n 12 and 0.87 at n 16 (v-local). Treat single numbers measured at one
n accordingly.

## Findings, after adversarial review

Six teams explored; four verifiers then tried to refute the claims the
optimizations rest on. Verdicts: 28 confirmed, 37 partly, 4 refuted,
1 untested (`orch/r2-*.md`). Statements below are the reviewed versions.

### What bubble physics does to blocks

- FREE forgets the blocks. One cluster becomes a sphere of its volume, two
  face-touching clusters the standard double bubble, three a triple bubble.
  Closed forms predict the outer radii within −0.7 % to +5.5 % for two-cluster
  configurations up to 8 blocks, so small free clusters need no simulation
  (phys C13, not reviewed). Generated-looking terrain balls up.
- The anchored regimes span blocky to bubbly. FID-0.25 and FID-0.4 barely move
  the blocks (shape change ≤ 0.01 block for FID-0.25 even at n 32), so their
  look is the renderer's blur (look L6, confirmed). CAGE-r with r ≥ 0.15
  and FINITE-T with T ≥ 2 turn a lone block into a sphere (look L11, partly:
  CAGE-0.05 and FINITE-1 keep a rounded cube).
- No listed regime both rounds visibly and keeps the 1×2 tunnel at n 16. At
  n 20, NOVOL-1 and CAGE-0.05 keep it at exactly 1.90 × 0.70; NOVOL-1 then
  fails the 2-high room and keeps only 2/3 of a lone block's volume (look L1,
  partly).

### How clusters combine

1. **Union is linear.** One relaxation step from the blocks is exactly a sum
   of per-block separable kernels, a metaball model (max difference 8e-8;
   fast C1, confirmed). Each point goes to the material with the least film
   cost.
2. **The bubble pressure is the only long-range carrier.** With volume
   conservation off, changing one block changes labels within 0.475 block and
   nothing farther. With it on, the whole cluster responds (local L1 and L2,
   confirmed). Under FID-0.15 a 1×1×4 bar attached 4+ blocks away from a 1×2
   tunnel drains into it and fills it (look L2, confirmed; v-local measured
   the bar keeping 0.14 of its 4 block³).
3. **Diagonal contacts are where the lattice and physics disagree**
   (v-union). Four bubbles around one lattice edge (an X) is never an
   equilibrium; physics connects one diagonal pair:
   - a solid pair facing an air diagonal always unites;
   - a corner-only contact stays apart in deterministic runs (it merges under
     re-drawn noise, so "never" is a rule choice);
   - the lower film tension gets the central film in the exact solver, but
     the engine makes different solids adhere across a corner where physics
     separates them;
   - on a tension tie the pair with the higher instantaneous pressure
     connects. That pressure is set by the corner structure within 1–2 blocks
     and by g, not by cluster size: "the smaller cluster wins" is refuted
     (two-block dominoes beat single blocks 12/12), and so is the 4×4-window
     minority rule of `teams/local/rule4.mjs` (the engine and the exact solver
     both contradict it on configuration W1);
   - the owner's painted 1-wide diagonal line connects: its blocks' pressure
     is about 4.7 times the background halves' in the engine (2.6 times in the
     exact solver), and the line wins every X in 12/12 variants;
   - near-ties are method-dependent (LX-10x4: engine B 12/12, exact solver A
     64/64), so they are design choices, and in 3D a tie can resolve with both
     pairs connected by layering.
4. **On generated terrain the hard cases are rare.** A 2×2×2 corner has 738
   material classes (551 with air and solid; 22 solid/air only), counted three
   ways. On four seeds, 30–31 classes cover 99 % of surface corners and 48–62
   cover 99.9 %; 86.5–88.8 % are single-material; 12.3–13.5 % are not Plateau
   configurations, and 99.6 % of those are same-material diagonal contacts.
   About 70 % of these surface corners are cave walls (table T1–T3, v-table).

### Optimizations

- **A per-corner table is viable, if fitted to mesh error.** Indexed by the
  corner's restricted-growth string: 21,147 × 3 int8 = 63,441 bytes, +0.13 to
  +0.23 ms per chunk (table T11, confirmed). Vertex error does not rank
  meshes: under FID the bevel rule has lower vertex error than cubes but
  higher mesh error. A table fitted to mesh error scores 0.037–0.040 block on
  held-out terrain under FID-0.15, against 0.060–0.061 for cubes, 0.049–0.058
  for the no-volume physics table and 0.078–0.096 for the bevel rule; under
  FINITE-4, 0.046–0.050 against 0.090–0.096 for cubes. On builds and small
  objects plain cubes still win (FID builds 0.024 against 0.028; catalogue
  cubes 0.041 against 0.149 for the no-volume table) (v-table).
- **A block-resolution surface-nets mesh cannot show fine rounding.** For a
  2D convex edge with fillet radius r, the best vertex offset is zero below
  r ≈ 0.3; at r = 0.5 the best placement recovers 19 % of the cube's error;
  on-surface vertices first beat cubes at r ≈ 0.75. The FID-0.15 terrain
  rounding sits at about r 0.46 (inference from circular fillets) (v-table).
- **A local one-step model exists, but it is not the physics.** A box*tent
  kernel at σ ≤ 0.204 makes a corner's field depend only on its 8 blocks; a
  local pressure estimate λ_b = a + b((27 − n27_b)/26)^4 keeps volume within
  −3.0 % to +4.0 % per material on 15 configurations outside its fit; reach
  ≤ 2.65 blocks, and vertices change only within 1 block of an edit. But it
  keeps thin features where the physics drains them (far-bar p95 error 1.0),
  fails the 1×2 tunnel in the field itself (1.75–1.785 against 1.90, so the
  §7.4 caps are still needed), moves flat ground by −9/256 to +8/256, and its
  vertex solver leaves 3.7–3.8 % of terrain corners off its own surface. The
  Newton variant costs 2–8 ms per chunk, the safeguarded one 4–20 ms (fast,
  v-local).
- Not worth pursuing: larger table keys (a 4×4×4 key covers 2–5 % of new
  corners; table T7, confirmed) and power-diagram walls (with one site per
  block they are the block faces; prior, not reviewed).

### What failed

- **Shape boxed, paint free (`teams/look/src/mbo-look.mjs`, BOX0-PAINT).** The
  constraints hold at n 20 and 24 on 29 scenes: tunnel 2.0 × 0.70, 2-high room
  2.0 × 1.70, trench 0.70, flat ground exactly flat with a vertical cap of 0
  (look L4, confirmed). On a 1-thick slab the painted diagonal becomes one
  straight band. On ground two or more blocks thick the paint behaves like
  free bubbles: the line drains to the slab corners or contracts into a blob,
  a checker goes from 18 parts to 1, pixel letters from 5 parts to 2; no paint
  fidelity tested gives both the band and stable paint (look L5, partly;
  combined claim refuted; `samples/11-…`).
- **Seam grooves in anchored images are render blur.** Under the box
  candidate the seam is exactly flat on the labels; under FID-0.15 the faces
  pillow up one sub-cell. The rendered groove follows a closed form in λ and
  g. Real label grooves form under FINITE-4 (0.16 deep at n 24), and Young's
  120° opening was approached only in 2D (119.4° at n 256) (v-look; prior
  seam-groove refuted for the anchored images).

### Decisions physics leaves to the owner

- Which pair connects at a tied or near-tied X, and whether a 3D tie may
  connect both pairs.
- Whether different materials touching only at a corner adhere.
- Grooves at material seams, or flat seams.
- Volume conservation (bubblier, but non-local) or a local rule (needs a guard
  for thin features).
- A rounding scale of at least about half a block, or the mesh will not
  show it.

### A possible next step (not built)

A third `MeshParams.rule = 'bubble'` beside `'hints'` and `'bevel'` (PLAN.md
§7.9 is the precedent): a frozen per-corner offset table fitted to mesh error
from a short-relaxation look, a per-edge table for diagonal contacts carrying
an explicit tie rule, and the §7.4 constraint box applied afterwards. Painted
content would need a separate surface-only approach; the 3D bubble version
floods. The mesh goldens would need re-emitting before the D-24 freeze.

## Method

- **Round 1** (six teams, at most three at a time): `phys` (validation, an
  exact 2D foam solver, the FREE catalogue), `look` (regimes, game
  constraints, candidates), `local` (locality, context, combination rules),
  `table` (corner classes, terrain frequencies, tables), `fast` (one-step
  local models, determinism, cost), `prior` (literature, with a verified
  citation log in `teams/prior/citations-log.md`).
- **Round 2** (four adversarial verifiers): `v-union` (diagonal contacts),
  `v-local` (locality and the local model), `v-look` (candidates at n 20/24,
  seams), `v-table` (tables and mesh error). Not reviewed: phys C1–C5, C9,
  C10, C13–C15; local L3, L5–L8, L10, L14, L19; table T1, T2, T14; fast C2,
  C7; seven of prior's 14 claims.
- A first round-1 attempt with six teams at once made the machine thrash and
  restart; the restart wiped the session's temporary folder. The engine was
  rebuilt from copies in the agents' transcripts and reproduced the earlier
  calibration exactly; round 1 was then rerun.

## Layout

- `HARNESS.md` — engine, regimes, calibration, numerical limits, team rules.
- `lib/` — engine (`mbo.mjs`), renderer, catalogue (36 configurations),
  runner, measuring helpers, contact-sheet tool (`sheet.py`).
- `out/` — calibration and reference runs.
- `orch/` — per-team digests of the structured results (`r1-<team>.md`,
  `r2-<verifier>.md`), the raw workflow outputs (`r1-output.json`,
  `r2-output.json`), and the corner-class count (`classes.mjs`).
- `teams/<id>/` — each team's code, results (`res/`, `results/`), logs and
  images.
- `samples/` — the curated contact sheets.
- `build-bundles.mjs` — rebuilds the esbuild bundles of repo source.

There is no REPORT.md per team: the agent harness refused report .md files
from subagents, so each team's report is its structured result in
`orch/r1-output.json` and `orch/r2-output.json`, rendered in `orch/*.md`.

## Running

From this folder, after `npm install` at the repo root:

```sh
node build-bundles.mjs                               # generated bundles (git-ignored)
node lib/run.mjs <outDir> '{"anchor":{"kind":"fidelity","k":0.15}}' pair-diff,slab-line --before
python3 lib/sheet.py <spec.json>                     # contact sheet (needs Pillow)
node orch/classes.mjs                                # the 738 / 22 corner-class count
```

Most team scripts locate their own folder from `import.meta.url`, and the
shell scripts locate themselves, so they run from anywhere. Keep to one heavy
node process at a time on an 8 GB machine (`--max-old-space-size=700`).
Checked when recording: `orch/classes.mjs` gives 738 classes, `lib/run.mjs`
reproduces the pair-diff calibration (23 steps, volumes kept), and the four
bundles rebuild byte-identically.

## Not included

- 75 MB of compressed simulation caches (`*.gz`: look's saved labels, fast's
  `refcache/`, v-table's `cache/`); the scripts rebuild them.
- About 2,000 raw renders. Kept: 184 images (every contact sheet, the
  calibration images in `out/`, and the images the teams listed or cited in
  their results), plus the 21 sheets in `samples/`.
- The generated bundles (`build-bundles.mjs` rebuilds them).
- Early calibration scripts lost in the restart, the partial work of the
  first round-1 attempt, and the workflow transcripts.

## Changes made when recording

- Absolute paths were rewritten. The study folder's own paths became relative
  to this folder; repo paths became `../..`; other session folders outside the
  repo became the placeholders `<session>`, `<scratchpad>` and `<backup>`.
- In 11 code files, repo imports became relative and the shell scripts locate
  themselves.
- The study's own README became `HARNESS.md`, with a note at its top.
- This folder's `.gitignore` re-includes `logs/`, `*.log` and `out/`, which the
  repo root ignores, and ignores the caches, bundles and raw renders.
