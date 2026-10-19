# Round 3 (partial): adversarial checks of the remaining candidates and the integrated stack

All five round-3 agents (reviews of fitted boundaries, contour codes and
synthetic crossings; a GPU cost probe; the stack integrator) stopped at a usage
limit. This report collects what they left in their folders, plus checks run
directly afterwards with the same tools. Every command runs from this folder
after `node build-bundles.mjs`.

Two tools write into tracked files. Since recording, `approaches/mx-codes.mjs`
and `work/mx/mxlib.mjs` write their per-tool stats to `work/mx/stats/` only
with `MX_STATS=1`; before that, every command that loaded them overwrote the
recorded stats on exit. `work/cmp/run-adv-cmp.mjs` merges its results into the
tracked `work/cmp/adv-results.json`.

## Adversarial paint suite on all four material methods

`node work/vmf/harness-metrics.mjs approaches/hints.mjs approaches/mf-iso.mjs approaches/mv-quad.mjs approaches/mx-codes.mjs`
(scenes in `work/vmf/adv-scenes.mjs`; side-by-side images with
`node work/cmp/run-adv-cmp.mjs --only <scenes> approaches/hints.mjs approaches/mf-iso.mjs approaches/mv-quad.mjs approaches/mx-codes.mjs`).
Cells: displayed area of the painted material against its block count, and the
number of connected parts.

| scene | hints (today) | mf-iso (smoothed field) | mv-quad (fitted boundaries) | mx-codes (contour codes) |
|---|---|---|---|---|
| stripes-h2 | ×1.00, 7 parts | ×1.30, 1 part | ×1.00, 7 parts | ×0.88, 7 parts |
| checker16 | ×1.00, 128 parts | ×1.40, 22 parts | ×1.00, 128 parts | ×1.00, 128 parts |
| stripes-d3 | ×1.00, 86 parts | ×2.58, 1 part | ×0.96, 11 parts | ×0.74, 23 parts +18 specks |
| stripes-12 | ×1.00, 60 parts | ×1.44, 1 part | ×0.76, 42 parts | ×0.89, 42 parts +4 specks |
| dither-2x1 | ×1.00, 64 parts | ×1.38, 10 parts | ×0.88, 44 parts | ×0.86, 50 parts +14 specks |
| dither-25 | ×1.00, 64 parts | ×3.20, 1 part | ×1.00, 64 parts | ×0.79, 64 parts |
| lines-T | ×1.00, 1 part | ×1.08, 1 part | ×1.00, 1 part | ×0.93, 1 part |
| lines-X | ×1.00, 1 part | ×1.02, 5 parts | ×1.00, 1 part | ×0.91, 1 part |
| lines-Xdiag | ×1.00, 41 parts | ×1.24, 5 parts +8 specks | ×1.00, 1 part | ×0.97, 1 part +4 specks |
| lines-Tdiag | ×1.00, 21 parts | ×1.26, 1 part | ×0.99, 1 part | ×0.97, 1 part +2 specks |
| pixel-text | ×1.00, 21 parts | ×1.06, 4 parts | ×1.16, 17 parts | ×0.80, 13 parts |
| corner4 / corner3 / corner4-diag | ×1.00, 1 part | ×1.00, 1 part | ×1.00, 1 part | ×1.00, 1 part |
| corner3-thin | ×1.00, 1 part | ×1.11, 1 part | ×1.00, 1 part | ×0.99, 1 part |
| hill-line1-1:1 | ×0.97, 24 parts | ×1.45, 1 part | ×0.97, 1 part | ×0.94, 7 parts |
| hill-line1-1:2 | ×0.99, 12 parts | ×1.25, 2 parts | ×1.00, 1 part | ×0.96, 1 part |
| flat-line1-1:1 | ×1.00, 24 parts | ×1.36, 1 part | ×0.99, 1 part | ×0.97, 1 part |
| sharp-mix | ×1.05, 22 parts | ×1.59, 3 parts | ×1.04, 3 parts | ×0.98, 3 parts +1 speck |

Reading: 8-connected diagonal lines count as one part per block under hints
(they touch only at corners). Fitted boundaries keep the part counts of the
straight stripes, the checkerboard and the 25 % dot dither, and join each
diagonal stripe or line into one part on flat ground and on hills, but they
change the counts of the 1:2 stripes (60 → 42), the 2×1 dither (64 → 44) and
pixel text (21 → 17). Contour codes lose area and add specks on stripes and
dithers, and break the 1:1 line on a hill. Visually, every method damages pixel
lettering; fitted boundaries invent two long border lines around the 1:2
stripes (`stripes-12`) and, in images regenerated when recording, turn the
outer rows of the 2×1 dither into wavy bands.

## Review of mv-quad (fitted boundaries), partial — `work/vmv/`

- **Cliff-top leak (bug).** A 1-wide stone path at the foot of a 2–4-high grass
  step also shows on the step's top: 12.3–12.7 blocks² of stone where hints shows
  none (`cliff-leak.txt`). Walls of planks or brick do not leak.
- **Tears.** Boundaries step across quad edges, by up to a whole block, on
  20.1 % of material-changing edges in pixel text and 14.8 % in the 1:2 stripes
  (`stripes-12`). A curved planks path loop steps on 8.0 %, by at most 0.13
  block; discs, blobs and straight lines on 0–2.3 % (`qsteps.txt`).
- **Small shapes reshaped.** Bars, tetrominoes, 2×2 to 4×4 squares and rings
  show 1.1–4.5 blocks² of wrong material each; an arrow's 3 parts merge into 1
  (`shapes.txt`). Solid bars and squares 5 or more blocks across, and the 7×7
  ring, are exact; the 5×5 ring (1.97 blocks² wrong), the radius-2 pixel disc
  (2.46) and the arrow (4.16) are not.
- **Popping while drawing.** Drawing a curve block by block changes the
  displayed boundary up to 7.6 blocks from the new block (an arc of radius 14,
  labelled `arc-r10` in the script; squares and outlines up to 6), with 12–24
  blocks² of far changes over the sequence (`edit-seq.txt`).
- **One paint can break a diagonal line.** A stone block painted diagonally
  beside the 1:1 stone line, touching it only at a corner, necks the band to
  0.008 wide, the corner-only contact hints shows (`neck.txt`, paint 15,17),
  and splits it into 6 parts and a speck where it was one (`neck-parts.txt`,
  added when recording).
- **Holds:** crossings, T, L, `#` and ladders stay one part (`junctions.txt`);
  a lone dot keeps its size whatever is painted 2 or more away
  (`sensitivity.txt`); a sand block painted beside a diagonal line necks it to
  0.35 wide without splitting it (0 of 36 such paints split it,
  `sensitivity.txt`), and stone painted edge-on beside it leaves it 0.70–0.79
  wide (`neck.txt`); a path at a 1-high step's foot stays one part at half area
  (`foot-lines.txt`); straight edges on a curved hill keep a spread of
  0.03–0.04 and stray at most 0.06–0.10 (hints 0.24–0.28 and 0.59–0.64)
  (`hill-edges.txt`).

## Review of mx-codes (contour codes), partial — `work/vmx/`

Results only; this reviewer left no write-up. It ran mx-codes through
`approaches/vmx-codes.mjs`, the same code without the stats writer.

- **Reproduction.** All 36 harness scenes match the team's numbers
  (`compare.txt`, `run-vmx-codes.txt`); its paint-suite run
  (`harness-metrics.txt`) is the mx-codes column above.
- **Foreign material (cause not traced).** On a mound painted with a band
  (`mound-band`), 0.078 % of fragments in the overview and 0.171 % in the
  close-up show a material that no surface block within 1 of the fragment's own
  block has; the other eight scenes show none (`diag-3d.txt`; the classes are
  defined in `diagview.mjs`).
- **Junctions shed area.** Crossings, T, L, `#` and a ladder each stay one
  part, but a 5-block plus sign shows 2.3 blocks², a 1-wide X 35.3 of 39 and a
  `#` 63.1 of 76; the ladder grows to 72.1 of 60 (`focused-1.txt`).
- **Holds:** one stone paint beside the 1:1 line leaves it 0.68–0.75 wide
  (unpainted 0.70); a path at the foot of a 1- or 2-high step stays one part at
  17.8 of 18 blocks² (hints 15.2); a lone dot shows 0.79 of its block with or
  without a ledge beside it, the inscribed disc of round 2 (`focused-1.txt`).

## Review of gh-cc8b (synthetic crossings), partial — `work/vgh/`

- **Containment.** The bypass that broke the context caps (a natural 1-block
  step plus a placed block) stays blocked: synthetic scenes A–C blocked at all
  11 hint phases, diagonal scene D walkable only at +0.45 (hints walkable at
  +0.25 to +0.45) (`bypass-sweep.txt`, `bypass-diag.txt`); 40 real terrain
  edges: 0 climbed onto the placed patch, against 18 for gs-ctx
  (`bypass-real2.txt`; the first version counted runs that ended beside the
  patch).
- **One regression.** A placed 1-block rise on natural ground whose surface is
  0.45 or more below its grid plane cannot be walked up (a 0.6-high riser
  segment steeper than 50°); hints walks it at every phase (`rise1.txt`;
  `battery-rises.txt`: gh 42/51, hints 43/51). 17 real patches, all at phases
  −0.29 to +0.20, were walkable (`rise1-real.txt`).
- **Same as hints:** tight passages 41/46 for every rule, including cubes
  (`battery-clear.txt`); idle drift none (`battery-stand.txt`); sprint-jumping
  onto a 2-block rise works under every smooth rule (pre-existing).
- **Seams:** 8 chunks around a corner are byte-identical at apron 10 and 9
  against 24 (`seams3d-*.txt`).
- **Edit cost** (interleaved min, 52³, `editcost.txt`): strip mine +5.9 ms,
  village +4.2, lattice tower +9.6, dense heightfield +4.5, scaffold +19.9,
  35 % rubble +34.7, dug sponge +30.0 per chunk over hints.
- **Look:** on flat ground, placed floors 4×4 and larger sit flat to 0.001;
  2×2 and 3×3 floors sag 0.25 and 0.19 (hints sags them 0.47 and 0.35, and
  lifts floors on natural ground by up to 0.05) (`pillow.txt`). On real
  terrain, 8 of 17 placed 5×4 patches sag 0.17–0.32 at the centre (hints
  0.06–0.07, gs-ctx 0.11–0.12) (`rise1-real.txt`). A lone block on a placed
  floor spreads to a 5.5-block² footprint (hints 0.9, gs-ctx 4.0) (`lone.txt`).

## Integrated stack — `work/stack/`, `approaches/stack-base-l.mjs`

gh-cc8b geometry, gn's box AO with the linear onset, production normals, and
generator material hints on generated blocks; edited blocks show their own
material (no edit-zone method was plugged in before the stop).

- AO onset choice (`work/stack/ao-compare.txt`): one block out from a build,
  the linear onset keeps today's ground AO exactly; at the foot it lightens it
  (fence 0.92 vs 0.91 today, 4×4 block 0.84 vs 0.78, 2-high wall 0.94 vs 0.86),
  and a post or a single block loses its shadow (1.00 vs 0.96 and 0.98). The
  quadratic onset lightens both distances. AO roughness on 16 real chunks falls
  from 0.076 to 0.017 (linear) or 0.022 (quadratic), and up-facing vertices
  darker than 0.9 fall from 46 % to 24 % or 20 %.
- Harness: geometry rows equal gh-cc8b; AO roughness 0.000–0.026 on built and
  generated scenes; all constraint scenes pass; `harness/seams.mjs` at apron 10:
  0 mismatches. That test also passes at apron 6, so it cannot show the apron
  is long enough, and its world has no generator planes, so the gm path does
  not run in it.
- Real terrain before/after sheets (today | bevel | stack):
  `node work/final/sheets.mjs` writes them to `work/final/img/`.

## Not done

- GPU timing on the floor device: the probe stopped before launching a browser;
  its unfinished folder is not kept.
- Plugging fitted boundaries or contour codes into the stack's edit zones.
- The fresh-eyes look review of the integrated stack.
- An adversarial review of the linear AO onset (the vgn review covered the
  quadratic one) and of generator material hints (gm had none).
- A seam test of the stack against apron 24, like `work/vgh/seams3d.mjs`.
