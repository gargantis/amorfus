# Bubble study — shared engine and conventions

Research for amorfus (voxel game). The owner's request: "each block acts like
a bubble. Neighboring bubbles of differing material stay separate,
neighboring bubbles of the same type unite. Investigate how different
clusters combine to see if there are patterns that lead to optimizations.
Generate sample image for various configurations of bubbles."

This is the contract the study's agents worked to, as it stood during the
study. It was written for a session scratchpad outside the repo; when the
study was recorded here, absolute paths were rewritten (see README.md). `S`
below is this folder; run scripts from here.

## Layout

- `lib/mbo.mjs` — the physics engine (read its header comment).
- `lib/render.mjs` — `renderView` (perspective ray march), `renderSlice`
  (cross-section with films), `blocksSlice`, `savePng`, `PALETTE`.
- `lib/configs.mjs` — `CONFIGS` (36 named block configurations), `byName`,
  `to2D` (flat x–z configuration → 2D x–y for `dims: 2`).
- `lib/run.mjs` — `node lib/run.mjs <outDir> '<regimeJSON>' <names|all> [--before]`
  runs configurations, writes `<name>-view.png`, `-slice.png`, `-blocks.png`
  (and `-before.png`), and `results.json`. Exports `runOne`, `blockBounds`,
  `beforeSim`.
- `lib/measure.mjs` — small measuring helpers (surface along a ray, owner
  changes along a segment).
- `lib/sheet.py` — contact sheets: `python3 lib/sheet.py spec.json`, spec =
  `{"out", "cols", "title", "cell": [w, h], "items": [{"path", "label"}]}`.
- `out/` — the orchestrator's calibration runs (read-only for teams).
- `teams/<id>/` — each team's own folder. Write only there.

Do not edit `lib/`; copy a file into your team folder to change it, and say so
in your report.

## Coordinates

Blocks are `[x, y, z, material]`, y up; block (x, y, z) fills
[x, x+1] × [y, y+1] × [z, z+1]; lattice corners are integer points. Materials:
0 air; game materials 1 grass, 2 dirt, 3 stone, 4 sand, 5 planks, 6 brick,
7 spare; bubble scenes use A = 6 (red), B = 7 (blue), C = 1 (green),
D = 4 (sand). Flat configurations lie in the x–z plane at y = 0.

## The model (lib/mbo.mjs)

Each face-connected cluster of one material is one bubble (phase); air is the
reservoir. Multiphase threshold dynamics (MBO, Esedoglu–Otto 2015): each step
blurs every phase indicator with a Gaussian of std `s` sub-cells and assigns
each cell to the least ψ_i − λ_i, ψ_i = Σ_j σ_ij u_j, with σ(solid, air) = 1,
σ(different materials) = `g`, σ(same material, different clusters) = `eps`
(0.05). λ_i (the bubble's pressure) is solved each step so each bubble keeps
its volume (`volume: true`). Same-material phases that touch (face-adjacent
sub-cells) merge: that is "uniting".

`simulate(blocks, opts)` → sim. Options (defaults): `dims` 3, `n` 16
sub-cells per block (32 in 2D), `s` 0.2·n, `margin` 1.0 block, `g` 1,
`volume` true, `anchor` null, `maxSteps` 150, `stopAfter` 3 quiet steps,
`merge` true, `jitter` 0, `seed` 1, `renderS` 0.125·n.

Regimes used in the study (name them this way in reports):

| name | options | meaning |
|---|---|---|
| FREE | `{}` (maxSteps ≥ 300) | real bubbles: volume kept, nothing else; runs to equilibrium |
| FINITE-T | `{maxSteps: T, stopAfter: 99}` | relax for T steps from the blocks, then stop |
| CAGE-r | `{anchor: {kind: 'cage', r}}` | a bubble may occupy only its blocks dilated by r (box metric) and keeps them eroded by r |
| FID-k | `{anchor: {kind: 'fidelity', k}}` | cost k per cell for leaving its original bubble: surface tension against a spring back to the blocks |
| NOVOL-T | `{volume: false, maxSteps: T, stopAfter: 99}` | plain MBO (mean-curvature flow): bubbles shrink |

The sim exposes `label` (phase per sub-cell), `phases[p]` (`mat`, `blocks`,
`target`, `lambda`, `alive`, `box`, `val`), `D` (smooth field, > 0 in solid,
the rendered surface is D = 0), `Sall`, `history` (label changes per step),
`steps`, `converged`, and helpers `sampleGrid(sim, sim.D, x, y, z)`,
`samplePhase`, `phaseAt` (owning solid phase or 0), `volumes(sim)`.

## Calibration (orchestrator, 2026-10-21)

- Single block → sphere: radius 0.625 at n = 8; theory 0.6204.
- Equal double bubble (`pair-diff`, unit volumes), measured on labels:
  n 16, s 0.2: wall flat at x = 1.000, wall disk radius 0.586 (theory
  0.5685, +3 %), wall-to-tip 1.000 (theory 0.9846, +1.5 %). At n 8 s 0.3:
  0.615 / 1.000; n 12 s 0.3: 0.645 / 0.917; small s (0.1–0.15) pins early
  (tips 1.05–1.08). No (n, s) is exact; n 16, s 0.2 is the default.
- Speed: ~0.3 s per step at 1.1 M cells (terrain-step); small scenes
  0.2–3 s total. Peak RSS ~180 MB for 1.1 M cells.

## Known numerical limits — check before believing a pattern

1. **Pinning.** MBO freezes an interface when its motion per step is below
   about half a sub-cell. Smaller `s` pins earlier. Large clusters converge
   slowly (terrain-step FREE: 300 steps, not converged).
2. **Four-way junctions persist under exact symmetry.** In 2D `sq2-checker`
   FREE with jitter 0, the X junction never resolved; with `jitter: 1e-3`
   it resolved in 3 of 3 seeds (A pair united in 2, B pair in 1). In
   `sq2-ABCD` (four materials) the X stayed even with jitter 1e-3 and 1e-2:
   real foam would split it into two triple junctions (a T1 step), so this is
   most likely pinning. With `jitter: 1e-2`, checkerboard seed 4 united BOTH
   pairs — possibly a noise artefact. Use jitter 1e-3 and several seeds for
   any symmetric case; compare to an independent method where you can.
3. **Tie-break bias.** With jitter 0, exact ties go to the lower phase index
   (phases are numbered in block order). Reorder blocks or use jitter to rule
   this out in symmetric configurations.
4. **Render field vs labels.** `D` is a re-blurred, volume-corrected version of
   the final labels (renderS = 2 sub-cells). It rounds sharp creases by about
   0.1 block. Measure geometry on labels when it matters; say which you used.
5. **2D runs** need `to2D` for flat configurations (x, z → x, y).

## Observations so far (orchestrator; not yet reviewed)

- FREE destroys block shapes: any isolated cluster becomes a sphere of its
  volume; `terrain-step` balls up; `slab-line` becomes two B pillows with the
  A line united into one lens between them.
- FID-0.15 keeps block shapes with rounded edges, no seam between same
  blocks, and grooves at different-material seams; in 3D `slab-line` the six
  diagonal A blocks stayed separate (no union) under FID-0.15, but united
  under CAGE-0.25 and FINITE-6; in 2D FID-0.15 they united.
- CAGE-0.25 is too loose to anchor small clusters (pair-same ≈ FREE sphere).
- Images: `out/regimes-sheet.png` (6 configs × blocks / FINITE-6 / CAGE-0.25 /
  FID-0.15 / FREE), `out/try2d/sheet.png`, `out/try2d/jitter-sheet.png`.

## Rules for every team

- Read the repo freely; never write to it, never run git commands that change
  state. Bundle anything you need from the repo into your team folder (esbuild
  `--outfile` inside `teams/<id>/`).
- Memory is tight. The first attempt ran six teams at once; the machine
  thrashed and restarted, and the restart wiped /tmp (this whole folder). Now
  at most three teams run at once. Per team: one heavy node process at a
  time, `node --max-old-space-size=700`, grids ≤ ~1.2 M cells (use n = 12 for
  big scenes and say so), each run < 10 minutes; no background processes
  left running. If a run dies of memory, shrink it.
- Durability: after every major step, and before you finish, copy your
  folder to the backup outside /tmp:
  `rsync -a <S>/teams/<id>/ <backup>/teams/<id>/`
- Every number in a report cites the file it came from (a results JSON or a
  log in your folder). Mark inference as inference. Do not overstate.
- The repo is public and this study may be recorded there: never name the
  owner or refer to private notes; write "the owner", they/them.
- Images: PNG via `lib/render.mjs`; a contact sheet per topic via
  `lib/sheet.py`; label every image with config + regime. Keep it to the
  images that show something (≤ ~60 per team).

