# Smoothing study, 2026-10-18

The owner judged the §7.9 bevel rule (PLAN.md) after playing it: "I want
minimal jagginess both on the surface and also the boundary between differing
blocks. The bevel rule adds its own type of jagginess. The key is smoothness of
boundaries. Investigate other approaches if necessary." This folder records the
study that followed, run on 18–19 October 2026 against branch
`bevel-smoothing-rule` at commit `9a38533`.

**Status: findings, not decisions.** Nothing here is adopted. The owner
considers more work necessary before any of it lands. The code is research
code: `npm run check` does not build, lint, type-check or test it, but its
`public-scan` step scans every file here.

## Findings

### Why the bevel rule disappointed

- It ignores the generator's density hints, so smooth generated slopes become
  45° terraces: shading error 16.1° on a generated 1:4 slope and 34.7° on a
  generated hill, against 0.0° and 0.8° under today's hints rule.
- It shades every triangle flat, so every facet shows.
- On built stairs the D-3 clearance caps hold back the concave corners, so its
  "1:1 stair becomes a 45° plane" turns into alternating 27°/60° facets
  (17.0° rms). The mesher's own test missed this because nothing in it was
  shape-edited.

### Three proposals

Each improved the study's measurements. How far each was reviewed differs, and
is stated.

1. **Ambient occlusion at the vertex's actual position.** Most of the banding
   on smooth generated hills is AO, not geometry: `aoOf` counts blocks in a
   4×4×4 window anchored at the lattice corner. Evaluating a 4-wide box kernel
   at the moved vertex, over a partial-volume field (½ + 4ρ for generated
   blocks, occupancy for edited ones), removes it.
   - Result: AO roughness on 16 real chunks falls from 0.076 to 0.017 with a
     linear onset (0.022 with a quadratic one), and to 0 on an exact generated
     plane.
   - Look: one block out from a build, the linear onset keeps today's AO
     exactly. At the foot it lightens it (2-high wall 0.94 against 0.86
     today), and a post or a single block loses its contact shadow. The
     quadratic onset lightens both distances. Both brighten open ground:
     up-facing vertices darker than 0.9 fall from 46 % to 24 % (linear) or
     20 % (quadratic).
   - Cost: +0.7–0.9 ms per unedited chunk; no data or shader change. On edited
     chunks, `gn-best` (this AO plus the rejected normals below) added +1.6 to
     +8.9 ms per typical chunk and +7 to +17 ms in dense builds. The review
     puts the AO's share at a third to two-thirds; it was not measured alone.
   - Review: the adversarial review tested the quadratic onset on 45 real
     chunks. The stripes are gone and deep cave cracks stay dark, but caves
     and overhangs come out about 0.05 lighter and open terrain nearly
     AO-free. It rated "AO keeps its purpose" only partly and left these as
     art decisions. The linear onset has not been reviewed.
   - Code: `work/gn/`, `work/stack/ao.mjs`; reports `round1-gn.md`,
     `round2-review-gn-best.md`, `round3.md`.
2. **Material hints from the generator.** Generated materials are thresholds
   of two continuous fields the generator already computes: S = SEA + 2 − H per
   column (sand) and D = dTerrain per block (top ≤ 1 < dirt ≤ 4 < stone).
   Interpolating them per vertex, as ρ already is for shape, makes every
   generated boundary a smooth contour.
   - Result, on 16 real chunks: the shoreline's spread about the generator's
     exact contour falls from 0.329 to 0.019 blocks. Boundary wiggle, the
     residual from a local fit, falls from 0.172 to 0.014 on the shore and from
     0.280 to 0.072 on grass|dirt. The pooled wiggle, 0.276 → 0.032, mostly
     reflects the dirt stripes vanishing: about 96 % of today's boundary points
     are grass|dirt.
   - Look decision: today's dirt stripes on slopes (6.65 % of the top surface)
     are a block-sampling artefact and vanish (0.27 %); a slope rule can bring
     them back as smooth patches on ground steeper than about 44°.
   - Cost: about +1 ms per unedited chunk and +2.9–3.6 ms per edited chunk in
     the prototype; two 12-bit codes in the reserved vertex bytes; no larger
     region for unedited chunks. The D and S planes add an estimated
     11–13 MiB at R = 192 (not measured). Seam-exact over 10 chunk borders
     (27 runs, 1,757 shared vertices).
   - Caveats: 3.07 % of the surface shows a material other than its stored
     block (dig a "grass" slope block and you may get dirt) unless the
     generator's block rule follows, which is possible only before the D-24
     freeze. The prototype `approaches/gm-hint.mjs` renders edit zones and
     every synthetic scene with `mf-iso`, rejected below, so its harness
     material rows are `mf-iso`'s; and any edit within reach, painting
     included, then needs the 52³ region. The generated-only copy that the
     stack uses is `work/stack/genfield.mjs`.
   - Review: none. No adversarial review covered it.
   - Code: `work/gm/`; report `round2-gm.md`.
3. **Synthetic crossings for placed and dug blocks.** Every sign-changing edge
   touching a shape-edited block takes its crossing from the nearest step
   contours within 8 blocks; no relaxation; D-3 caps only at narrow openings.
   - Result: built ramps 1:1 / 1:2 / 1:4 / 1:8 shade at 0.0° / 0.0° / 0.7° /
     3.9° rms (hints 0.1° / 5.6° / 10.6° / 11.5°); a 1-high step reads as a
     1.9-block rounded step; walls stay vertical. Unedited chunks are
     byte-identical to today.
   - Containment: walking up a 2-block rise stays blocked, including a natural
     step plus a placed block on 40 real terrain edges (0 climbed, against 18
     for `gs-ctx`). One synthetic diagonal case is walkable at phase +0.45,
     where hints is walkable from +0.25. Sprint-jumping onto a 2-block rise
     works under every smooth rule, today's included.
   - Caveats, from a review that stopped part way:
     - a placed 1-block rise on natural ground whose surface sits 0.45 or more
       below its grid plane needs a jump (hints walks it);
     - dense builds cost +4 to +10 ms per remesh (village, lattice) and +20 to
       +35 ms (scaffold, rubble, dug sponge), a little more than `gs-ctx` on
       six of eight builds in the same run;
     - placed floors 4×4 and larger sit flat on flat ground, but on real
       terrain 8 of 17 placed 5×4 patches sagged 0.17–0.32 at the centre
       (hints 0.06–0.07);
     - built domes are piecewise flat up close, ramp sides show mild scallops,
       and a lone block on a placed floor spreads into a low mound (footprint
       5.5 blocks², hints 0.9).
   - Code: `work/gh/`; reports `round2-gh.md`, `round3.md`.

`approaches/stack-base-l.mjs` combines all three (edited blocks keep their own
material). It passes every constraint scene and `harness/seams.mjs` at apron
10. That seam test also passes it at apron 6, so it cannot show that apron 10
is enough, and its synthetic world never runs the generator-material path. No
stronger seam test was run on the stack.

### Painted player content: open

The owner's own case is a 1-wide diagonal line of one material in another. On
flat ground it renders as one band of the ideal width under `mv-quad` and
`mx-codes`, and as one band about 1.3 times too wide under `mf-iso`. On a hill
`mx-codes` splits the 1:1 line into 7 parts and `mf-iso` beads it; `mv-quad`
keeps it whole. None of the methods is ready.

- **Fitted boundaries (`mv-quad`), most promising.** Recognises digital straight
  segments, arcs and deliberate corners, and stores two distances, two
  material ids and an AND/OR op in the 3 reserved vertex bytes, chosen per quad
  with vertex duplication (+19 % vertices). Best accuracy in the study (1:8 edge
  0.010, discs 0.05–0.10, squares and checkerboards kept). Open defects:
  - a path at the foot of a 2–4-high step also shows on the step's top;
  - one paint touching the line at a corner splits it into 6 parts;
  - boundaries tear by up to a block on 15–20 % of edges in 1:2 stripes and
    pixel text, and 1:2 stripes and the 2×1 dither lose area (×0.76, ×0.88)
    and gain invented border lines;
  - small shapes are reshaped by 1–4.5 blocks²;
  - drawing a curve moves the boundary up to 7.6 blocks from the new block;
  - cost: +18 ms mean and +54 ms worst per unedited chunk in the prototype,
    and an 8-chunk edit's slowest chunk goes from 13 to 43 ms, past C-12's
    33 ms p95; used on its own it needs a 52³–56³ region for every chunk.

  Reports `round2-mv.md`, `round3.md`.
- **Contour codes (`mx-codes`), not recommended.** Keeps corners and
  checkerboards crisp, but breaks a diagonal line on curved ground, sheds area
  and specks on stripes and dithers, and shows a foreign material on
  0.08–0.17 % of fragments on one painted mound. It needs 52³ regions for every
  chunk and a new GPU structure: 42–84 MiB at R = 192 as built, or 14–27 MiB
  with 50³ regions in a layout designed but not built. GPU cost unmeasured. The
  team's own verdict, "promising", came before the paint suite. Reports
  `round2-mx.md`, `round3.md`; review results in `work/vmx/`.
- **Smoothed material field (`mf-iso`), rejected.** Smooths shorelines on
  natural terrain (spread 0.329 → 0.145, against 0.019 for generator hints),
  but its thin-feature guard floods dot and stripe patterns into slabs (up to
  ×3.2 area), cuts line crossings apart, melts lettering and turns a path at a
  step's foot into dots. Report `round2-review-mf-iso.md`.

Every method damages pixel lettering. Smoothing only boundaries recognised as
lines or arcs, and leaving small shapes and patterns blocky, is the untested
middle path.

### Rejected

| Approach | Why |
|---|---|
| Bevel rule (§7.9) | See above. |
| Wide-support shading normals in edit zones (`gn-best` normals) | Thin builds glow on their shadow side, light halos ring every build, undersides light up at joints, and under an emulated triplanar shader their faces streak. The AO half of the same work is proposal 1. |
| Context-aware caps and windowed fitting (`gs-ctx`, `gs-mls`) | A natural step plus a placed block became a walkable 2-block rise: on 17 and 18 of 40 real edges for `gs-ctx` (two versions of the test) and on 13 for `gs-mls` (first version only). `gs-mls` also costs 2–11× today's remesh on dense builds (`gs-ctx` 1.1–1.5×) and spreads a lone placed block to a 4-block² footprint (hints 0.9). Synthetic crossings keep that rise blocked at about `gs-ctx`'s cost. |
| Curved refinement (`gc-*`) | Subdivision cannot remove terraces; the clearance caps, not refinement, bound built outlines; 4× triangles for one subdivision level, 9× for PN level 3, 16× for two Catmull–Clark levels. |
| Fragment-side pixel-art rules (`mx-xbr*`) | Shallow slopes stay jaggy at 31 texel fetches per fragment. |

### Further work the study did not reach

- GPU timing on the floor device (the probe stopped before launching a browser).
- Textured rendering. The harness renders flat block colours. Only the
  `gn-best` normals were checked under an emulated triplanar shader
  (`work/vgn/triplanar.mjs`), which showed smear on thin builds; no boundary
  method and not the stack was rendered with textures.
- Plugging fitted boundaries into the stack's edit zones, and fixing their
  defects above. The plug-in point is `makeStack({ zone })` in
  `work/stack/stack-core.mjs`; the zone contract is the header of
  `work/stack/zones.mjs`.
- Reviews not done: the linear AO onset, generator material hints, the
  stack's look, and a seam test of the stack against apron 24.
- The low-phase rise regression and the dense-build cost of synthetic crossings.
- §14 battery additions the reviews built and used: natural-lower-block rises,
  diagonal and L-turn passages, thin builds (posts, fences, tables), paint
  patterns, step-foot paths (`work/vgs/`, `work/vgh/`, `work/vgn/`, `work/vmf/`).
- Owner decisions: the dirt look on generated slopes; whether painted content
  should be smoothed at all; the AO onset.

## Method

`HARNESS.md` is the harness contract: module API, metrics, the honesty rule
(modules read only block data), and the round-by-round notes as they stood.
Every test scene rasterises a known smooth shape into blocks, so each rule is
scored against the shape the blocks came from:

- material boundaries: spread of the rendered boundary about its own mean
  offset, in blocks, plus area and connectivity;
- surfaces: shading-normal error against the ideal surface, AO roughness,
  plan outlines of terraces and towers;
- invariants: floating block, pillar, 1×2 tunnel, 2-high room, sharp wall;
- real terrain: 16 generated chunks of seed [1, 1]; seams between adjacent
  chunks; interleaved min-of-N timing.

Eight prototype teams (`mf`, `mx`, `mv`, `gh`, `gs`, `gn`, `gc`, `gm`), a prior-art
survey (`pa`) and six adversarial reviews (`vmf`, `vgn`, `vgs`, `vmv`, `vmx`,
`vgh`) ran over three rounds. A usage limit cut three round-1 teams short
(`mx`, `mv` and `gh`, finished in round 2) and stopped all of round 3;
`reports/round3.md` collects what those agents left plus checks run directly
afterwards. Every review that ran found defects the team's own numbers had
missed. No review covered `gm`, the linear AO onset or the stack.

Limits: a software rasteriser with flat colours (textures only in the one
emulation above); Node timing on a shared laptop (the bench means are noisy,
only interleaved timing is reliable); the round-3 reviews are partial.

## Layout

- `harness/` — scenes, rasterisers, metrics and the tools (`run`, `bench`,
  `compare`, `seams`, `timing`).
- `lib/src/` — a copy of the repo mesher that also returns each vertex's
  lattice corner (byte-identical output otherwise); `lib/physics-entry.ts`.
- `approaches/` — one module per variant, named `<team>-<variant>`.
- `work/<team>/` — each team's or reviewer's code and results (`.txt`,
  `.json`). `work/cmp/` and `work/final/` hold the cross-team comparisons;
  `work/stack/` the integrated stack.
- `reports/` — round 1: `gc`, `gn`, `gs`, `mf` and the prior-art survey;
  round 2: `gh`, `gm`, `mv`, `mx` and the `vmf`, `vgn` and `vgs` reviews;
  `round3.md`: the paint suite, the partial `vmv`, `vmx` and `vgh` reviews and
  the stack.
- `work-phaseB-mv-gh.txt`, `work-phaseB-mx.txt` — the round-2 results of `mv`,
  `gh` and `mx` as text; `dbg-*.mjs` — early harness checks.
- `build-bundles.mjs` — rebuilds the esbuild bundles the modules import.

## Running

From this folder, after `npm install` at the repo root:

```sh
node build-bundles.mjs                                  # generated bundles (git-ignored)
node harness/run.mjs approaches/hints.mjs               # writes out/hints/ (git-ignored)
node harness/run.mjs approaches/cubes.mjs --no-images
node harness/run.mjs approaches/bevel.mjs --no-images
node harness/run.mjs approaches/stack-base-l.mjs --no-images
node harness/compare.mjs cubes hints bevel stack-base-l # reads out/<name>/results.json
node harness/seams.mjs approaches/gh-cc8b.mjs
node work/vmf/harness-metrics.mjs approaches/hints.mjs approaches/mv-quad.mjs
node work/gm/terrain-metrics.mjs hints approaches/gm-hint.mjs
node work/final/sheets.mjs                              # before/after sheets in work/final/img/
```

Run everything from this folder: scripts resolve some paths against the working
directory. `work/cmp/run-adv-cmp.mjs` merges its results into the tracked
`work/cmp/adv-results.json`, and `MX_STATS=1` regenerates `work/mx/stats/`.

Checked when this folder was recorded, from a fresh clone: every bundle
rebuilds identically apart from path comments; all 82 approach modules give
results identical to the original study folder's on all 36 scenes, timings
apart; the commands above, the paint suite, the real-terrain metrics,
`work/stack/ao-compare.mjs` and a physics sweep reproduce their recorded
numbers.

## Not included

- Rendered images (3,678 PNGs); the scripts regenerate them.
- Harness results under `out/` (163 files: `results.json`, `summary.md` and
  `bench.json` per approach); `harness/run.mjs` and `harness/bench.mjs`
  regenerate them. Of the 58 old result files that have a module here, 24
  match today's runs exactly; the other 34 came from earlier versions of the
  harness or the code, mostly before the thin-line rescoring in `HARNESS.md`.
- Generated esbuild bundles; `build-bundles.mjs` rebuilds them.
- A copy of the vendored noise library (`work/gm/gen-gm.mjs` imports the
  repo's), the data and code of the unfinished GPU probe, two downloaded
  papers, two CPU profiles and three outputs of the `time` command. Timing
  results are kept.
- The machine-readable JSON of the round results, rendered into `reports/`.

## Changes made when recording

The code and results are as the study left them, except:

- absolute paths were rewritten to relative ones, and the owner's name and
  references to private owner material were removed;
- result logs were renamed from `.log` to `.txt`, and `work/pa/out/` to
  `work/pa/results/`, because the repo ignores `*.log` and `out`;
- `harness/png.mjs` creates its output folder, so the image scripts run in a
  fresh clone;
- the stats writers in `approaches/mx-codes.mjs` and `work/mx/mxlib.mjs` run
  only with `MX_STATS=1`, so reproducing a result no longer overwrites
  `work/mx/stats/`;
- `work/gh/src/core/mesh/mesher-r1.ts`, the team's saved round-1 source, was
  restored, so `work/gh/same-r1.mjs` and `work/gh/ab-mesher.mjs` run again;
- an audit of this folder traced its claims to their evidence. This README and
  `reports/round3.md` were corrected where the evidence did not support them,
  `HARNESS.md` gained a note on two stale baseline rows, and
  `work/vmv/neck-parts.mjs` with its output was added for one correction.
