# Adversarial review of mf-iso (vmf, round 2)

Verdict: **partly-refuted**.

## Reproduction

Yes, every headline number reproduces. My reruns (out/vmf-iso and out/vmf-hints, via wrappers approaches/vmf-iso.mjs and approaches/vmf-hints.mjs) match out/mf-iso and out/hints on every compare.mjs row: edges 1:1 0.000, 1:2 0.006, 1:3 0.007, 2:3 0.021, 1:5 0.054, 1:8 0.131; discs 0.130/0.129/0.148; junction3 0.085; hill 0.142; single ×0.56; checker ×1.33. Other figures that reproduce: high-pass 0.000–0.037 (work/mf/highpass.mjs); terrain areas grass ×1.01, dirt ×0.89, stone ×1.00, sand ×0.97 (work/mf/areas.mjs); triangles 6099 → 6174 (+1.23%); apron 5 gives 25 of 53,218 fields different, apron 6 gives 0 (work/mf/apron.mjs). Four numbers differ. (1) line1-1:2 scores 0.043/0.117 under the current harness, not the 0.183/0.295 in the report's table; this comes from the harness update, not the approach. (2) terrace-disc scores 0.218/0.485 against hints' 0.219/0.486, so 'all geometry rows equal hints' is off by the effect of flips. (3) The field pass alone takes 5.02 ms mean (median 4.69, max 9.18) at apron 6 in interleaved min-of-9 timing, against the 5.8 ms claimed. (4) The unedited path (generation plus mesh) goes from 9.61 to 18.37 ms (+91%), inside their stated +72–95%.

## Claims checked

- [partly] Straight material edges stop being staircases: 1:1 0.204→0.000, 1:2 0.258→0.006, 1:3 →0.007, 2:3 →0.021, 1:5 →0.054, 1:8 →0.131
  - Exact on flat ground (compare.mjs hints vmf-hints mf-iso vmf-iso). Not on curved generated ground, where most flips are blocked (twist > 0.03; 20 of 96 boundary quads flipped on the hill against 74 of 74 on flat). On the harness hill shape the 1:1 edge scores std 0.052, max 0.164 and the 1:2 edge 0.065, max 0.196. Boundary kinks reach p90 40.5° and max 55.5°, against 0° on flat (work/vmf/hill-edges.mjs, work/vmf/kinks.mjs).
- [holds] Block-scale (high-pass) jaggedness falls to 0.000–0.037 on every boundary scene
  - Reproduced with work/mf/highpass.mjs: maximum 0.037 (line1-1:2). The hill edges also stay at 0.031–0.036 high-pass. On the hill the error moves into kinks and low-pass waviness.
- [partly] The owner's 1-wide diagonal line renders as one continuous straight band of constant width (1 part, no pinch, width 0.95); the 1:2 line is continuous too
  - Holds for an isolated line on flat ground: 1 part, min width 0.93, ×1.36 area, and 0 of 36 single paints within 3 blocks split it (work/vmf/sensitivity.mjs). Fails in common contexts. A 1-wide + crossing gives 5 parts, a diagonal X 5 parts + 8 specks, a '#' 8 parts (work/vmf/junctions.mjs). One stone block added beside the diagonal necks it from 0.93 to 0.46 (work/vmf/neck.mjs). On the hill the 1:2 line splits into 2 parts and the 1:1 line beads. At the foot of a grass step a 1-wide line becomes 16 dots.
- [holds] Discs 0.27–0.30 → 0.13–0.15; three-material junction becomes a clean Y (0.085); hill 0.330 → 0.142
  - Exact reproduction. Zoom at 112 px/block (out/vmf-adv/zoom-junctions.png) shows a clean Y and a consistent 4-material bow-tie. Disc polylines still kink up to 24° (r4.3) and 31° (r2.4).
- [partly] Real terrain: shore and grass/dirt patches become smooth curves; displayed areas grass ×1.01, sand ×0.97, stone ×1.00, dirt ×0.89
  - Areas reproduce exactly. In plan view over 13 bench chunks, dirt parts drop from 520 to 314, plan dirt area from 823.5 to 673.2 blocks² (×0.82), with 77 specks under 0.25 block² (work/vmf/terrain-topology.mjs). Continuous zig-zag dirt riser bands break into separate slugs (out/vmf-adv/terrain-c111-close.png).
- [partly] A lone block survives as a small dot (×0.56)
  - True in isolation. The dot's size depends on blocks up to 3 away (work/vmf/pairs.mjs). A second dot 3 away makes each about 1.4 blocks² (×2.4). At 2 away the two fuse into one 2.85-block² oval, and four dots 2 apart become one 7.0-block² octagon. Painting an adjacent grass cell sand doubles the stone dot (×1.97–2.01). Next to a 3-long grass ledge the dot shrinks to 0.205 (work/vmf/foot-dot.mjs).
- [partly] Geometry, collision and every constraint are untouched; all geometry rows equal hints
  - Constraint rows and 14 of 15 geometry rows are equal. terrace-disc goes from 0.219/0.486 to 0.218/0.485 because flips move the surface by up to 0.03. Flips also break §7.2 'triangulate on the shorter diagonal'.
- [partly] Production data path: CPU pass, no new GPU buffers; the CPU collision copy can keep 2 triangles per quad, pick records unchanged
  - src/core/physics/collision.ts reads indexData[q*6 + t*3], and today the same indexData goes to the GPU and to collision. Fans replace a quad's 2 triangles with 4, so production needs a second index buffer: GPU with fans, CPU with flips but no fans. Both must swap in the same frame (§9.4).
- [holds] Vertex format: 6 × 5-bit codes in byte 12 bits 3–7, bytes 13–15 and flags bit 2 (30 bits); vertex size unchanged
  - It fits, but uses every spare bit and needs 5 bits per material. Block ids are u8, and PLAN.md §18 defers 'more than 8 materials', so the scheme hard-caps the palette at 8.
- [partly] Determinism: stored values are deterministic; fast path ≡ prototype on every scene
  - Two separate processes give byte-identical hashes on 87 meshes: 41 harness scenes, 30 adversarial scenes, 16 terrain chunks (work/vmf/det-hash.mjs). Fast path ≡ prototype fails on corner4, where 6 codes differ by one step at lattice corner (16,8,16). The fast path's raw r is -0.25000000000000006; the prototype's is exactly -0.25. Math.round gives -8 vs -7 (work/vmf/xcheck-corner4.mjs). All other 34 adversarial scenes and 9 chunks are identical.
- [holds] Apron 6 (verified; apron 5 changes 25 of 53,218 fields); 361 seam vertices, 0 differ
  - Team tool reproduces 25/53,218 at apron 5 and 0 at apron 6. My production-apron seam test (6 unedited, 10 edited, mixed-apron pairs, x/y/z borders): 0 of 558 shared vertices mismatch; apron 3 gives 18 of 558 (work/vmf/seams-prod.mjs). All 35 adversarial scenes are identical at apron 6 and 10. harness/seams.mjs --apron 6 shows 3 mismatches, all in the base mesher's normals in an edited region, which a 6/10 production choice avoids.
- [holds] CPU cost: field pass 5.8 ms; unedited path 10.6 → 18.3–20.7 ms (+72–95%); edited path +5.8 ms per chunk
  - Interleaved min-of-9 field pass alone: 5.02 ms mean, max 9.18 at apron 6; 5.26 ms, max 10.25 at apron 10. Generation 3.48/5.18/8.23 ms and hints mesh 6.13/8.17/11.90 ms at aprons 3/6/10, so the unedited path goes from 9.61 to 18.37 ms (work/vmf/timing-field.mjs). Built stress chunks reach 7.4 ms (wall grid) and 14.1 ms (pillars) (work/vmf/timing-stress.mjs).
- [partly] GPU cost: +1.2% triangles, +1.1% vertices, a few percent of fragment cost
  - Terrain reproduces at +1.23% triangles. A built wall grid reaches +6.8%, still inside the 25% budget. Fragment cost on the i7-1255U and the fwidth anti-aliasing are not testable here.
- [holds] Physics: fans coplanar (≤ 0.002 off); flips only where twist ≤ 0.03
  - Confirmed by reading work/mf/fast.mjs (midpoint rounded to 1/256; flips gated by √ of the midpoint distance). The terrace-disc outline changes by 0.001.
- [holds] Editability: no extra chunks per edit (field reach [c−6, c+5] inside the dirty set [b−9, b+10])
  - In fast.mjs the corner window is [c−3, c+2], support ±2 and the surface test ±1. src/game/edits.ts K_REACH_LO/HI = 9/10.
- [partly] Material-only edits update the boundary smoothly within about 2.5 blocks
  - A single paint changes displayed material up to 2.77 blocks away (median 1.61). It is not smooth. One block placed 2 away fuses two dots, and one 3 away makes a dot 2.4× bigger. One block beside a line halves the line's width. Adding ladder rungs deletes the rails (area 60 → 28.8).
- [partly] Sharp blocks are excluded from the kernel and stay crisp, an opt-out for crisp patterns
  - Sharp blocks do render crisp (sharp-mix scene). But sharp also pins geometry: on the hill, sharp pattern blocks stick out as cubes (out/vmf-adv/sharp-optout-hill.png). It is not a pattern-only opt-out.
- [holds] Failure mode: the 3-D kernel can count material through a 1-thick wall
  - Risk not visible in my scenes. With a 1-thick brick wall, sand and stone ground on one side and grass on the other, 0 sand/stone pixels appear on the grass side in plan view, and the close-up shows none on the wall face. A planks wall backed by stone also showed nothing.
- [fails] Failure mode: fans zigzag where the field is non-linear, and the auto rule avoids this on all measured scenes
  - A 1-wide line at a step foot becomes a row of about 0.2-block fan-centre squares. The inner edge of a 16×16 checker frame shows half-block triangular teeth. Diagonal line ends get a concave swallowtail notch (out/vmf-adv/zoom-ends-and-foot.png, out/vmf-adv/zoom-checker16.png).

## New failures

### [blocker] Dense paint patterns flood into slabs or become thick frames

Scored with the harness's own rasterTopDown and materialMetrics. A 25% dot dither (64 dots, 1 apart) becomes one solid slab at ×3.20 area. 1:1 diagonal 1-wide stripes with a 2-block gap (one-third stone) become one solid square at ×2.58. A 16×16 checker becomes a thick stone frame with scalloped outer edges around a raw-staircase interior with triangle teeth (×1.40, 22 parts). Seven horizontal stripes 1 apart become one frame (×1.30). 1:2 stripes give ×1.44, 1 part; a 2×1 dither ×1.38. Hints keeps all of them exact. Cause: every minority block gets a self-support boost τ(1−s)/((1−τ)s), and together the boosts win every corner.

Repro: cd . && node work/vmf/harness-metrics.mjs approaches/hints.mjs approaches/mf-iso.mjs (scenes stripes-d3, dither-25, checker16, stripes-h2, stripes-12, dither-2x1 in work/vmf/adv-scenes.mjs; images: node work/vmf/run-adv.mjs)

Image: out/vmf-adv/sheet-failures.png

### [blocker] 1-wide path crossings break apart, and added blocks thin or delete lines

A + crossing of two 1-wide stone lines gives 5 parts: a centre diamond and 4 arms cut off by about 1-block grass gaps. A '#' gives 8 parts. A ladder (rails 3 apart, rungs every 2) gives 8 parts at 28.8 of 60 blocks², because the rails vanish. A diagonal X gives 5 parts + 8 specks. One stone block added beside the 1:1 diagonal necks the line from 0.93 to 0.46 wide. The guard is non-monotonic: an arm block's boost drops 2.34 → 1.84 → 1.21 → 1.00 toward the crossing, so adding material removes it. mf-lite breaks the same way.

Repro: cd . && node work/vmf/junctions.mjs && node work/vmf/neck.mjs approaches/mf-iso.mjs

Image: out/vmf-adv/junctions.png

### [blocker] A 1-wide path at the foot of a step becomes dotted or vanishes

A stone line in hinted grass along a 1-high built grass step: hints shows 1 part at 15.2 of 18 blocks². mf-iso shows 16 parts at 3.5 blocks², a row of about 0.2-block squares left by the fan centres. At a 2-high step: 4 parts at 0.6 blocks². The same line one block from the step, or against a planks or brick wall, survives. The 3-D kernel counts the riser's grass blocks against the line.

Repro: cd . && node work/vmf/foot-lines.mjs (also out/vmf-adv/step-line-foot-close0.png from node work/vmf/run-adv.mjs --only step-line-foot)

Image: out/vmf-adv/foot-lines.png

### [major] Pixel text and small pixel art melt into blobs

3×5 glyphs '2068 / BEAM / RS#4' in stone on grass: stone goes from 21 parts to 4, so 12 glyphs merge into 4 amoeba blobs. Grass goes from 10 parts to 2, so 8 glyph holes fill in; the text is unreadable. A 5-block plus sign becomes a diamond (area 3.4). The stated opt-out (sharp) changes geometry: cubes on slopes.

Repro: cd . && node work/vmf/harness-metrics.mjs --only pixel-text,pixel-text-planks-on-stone approaches/hints.mjs approaches/mf-iso.mjs && node work/vmf/run-adv.mjs --only pixel-text

Image: out/vmf-adv/pixel-text-plan.png

### [major] Straight paint on curved terrain becomes ragged polylines; a 1:2 line breaks

Measured on the harness's generated hill shape. The 1:1 edge scores std 0.052, max 0.164 (0.000 on flat); the 1:2 edge 0.065, max 0.196 (0.006 on flat). Exact zero-set polylines turn at median 15.8°, p90 40.5°, max 55.5° (1:2 edge). A 1-wide 1:1 line turns at median 24.9° and max 56.9° (0° on flat) and beads in width. A 1-wide 1:2 line splits into 2 parts. Flips are blocked by twist (20 of 96 boundary quads flipped, against 74 of 74 on flat), and fans do not compensate.

Repro: cd . && node work/vmf/hill-edges.mjs approaches/hints.mjs approaches/mf-iso.mjs && node work/vmf/kinks.mjs approaches/mf-iso.mjs && node work/vmf/hill-close.mjs

Image: out/vmf-adv/hill-lines-close.png

### [major] A placed block changes other dots' size up to 3 blocks away; dots 2 apart fuse

A lone stone dot is 0.56 blocks². A second dot 2 away fuses with it into one 2.85-block² oval over the grass gap. At 3 away each dot grows to about 1.4 (×2.4). At 4 away each stays 0.56. Four dots 2 apart become one 7.0-block² octagon. Painting an adjacent grass cell sand doubles the stone dot (×1.97–2.01); 2 away it changes ×0.86–1.78. Lengthening a grass ledge beside the dot from 1 to 3 blocks shrinks it 0.569 → 0.205. A single paint changes pixels up to 2.77 blocks away. Hints changes nothing.

Repro: cd . && node work/vmf/pairs.mjs approaches/mf-iso.mjs && node work/vmf/pairs-img.mjs && node work/vmf/sensitivity.mjs approaches/mf-iso.mjs approaches/hints.mjs && node work/vmf/foot-dot.mjs

Image: out/vmf-adv/pairs-hints-vs-mf-iso.png

### [minor] Straight bands on walls wobble; line and stripe ends get notches and club feet

A 1-high planks band below a brick top row on a built 1-thick wall: dead straight under hints. Under mf-iso it has stepped, wavy edges and varying thickness, and stone stripes widen where they cross it. Stripe feet bulge into blobs at the wall base. 1:1 line ends get a concave swallowtail notch. The fan-centre dots and the triangle teeth at the checker frame edge are further new jagged shapes.

Repro: cd . && node work/vmf/wall-band.mjs && node work/vmf/ends.mjs

Image: out/vmf-adv/wall-band-close.png

### [minor] Real-terrain dirt riser bands break into dashes and specks

Plan view over 13 bench chunks (seed 1,1). Dirt parts go from 520 to 314 and plan dirt area from 823.5 to 673.2 blocks² (×0.82), with 77 specks under 0.25 block². Continuous zig-zag riser bands become separated slugs with gaps. The team reported this only as an area figure (×0.89).

Repro: cd . && node work/vmf/terrain-topology.mjs && node work/vmf/terrain-views.mjs 1,1,1 31,17,26 20,7,14 c111-close 560 380

Image: out/vmf-adv/terrain-c111-close.png

### [minor] Fast path ≠ prototype at an exact 4-way tie; stored codes sit on rounding knife-edges

corner4 (four materials meeting at a lattice corner): 6 codes differ by one step at corner (16,8,16). The fast path sums to r = -0.25000000000000006 where the exact value is -0.25, so Math.round gives -8 instead of -7. Within one implementation the result is deterministic (two processes byte-identical). Any reordered port, such as the proposed faster integration, changes stored codes and goldens in symmetric builds. Math.round half-up also makes q(+7.5) = 8 but q(-7.5) = -7, so the two sides of an edge disagree by one code at exact ties.

Repro: cd . && node work/vmf/xcheck-adv.mjs && node work/vmf/xcheck-corner4.mjs

Image: none

### [minor] Room floor corners: wall material spreads onto the floor; grass climbs fillets

Hut with a planks floor inside 1-thick brick walls: floor area ×0.84 (hints ×0.92), brick on the floor 7.66 against 3.93 blocks². At room corners the floor/wall boundary becomes a polyline off the crease. Grass climbs 0.30 up a 1-thick planks wall and 0.25 up a 1-high stone kerb; a 3-thick brick wall spreads brick 0.29 onto the ground.

Repro: cd . && node work/vmf/run-adv.mjs --only hut && node work/vmf/crease-bleed.mjs

Image: out/vmf-adv/hut-close0.png


## Look assessment

Where it works, it is a real improvement. On flat ground, isolated straight edges at 1:3 to 1:1 are perfectly straight (0° polyline turns), a single 1-wide diagonal is a clean constant-width band, the 3-material Y is crisp, and sand/grass shores read as curves. Bevel cannot do any of that.

But it brings at least six new kinds of artefact, and several change topology, which reads as a bug rather than an aesthetic:
1. Pattern flooding. Sparse or dense paint (dots, stripes, checkers) swells by ×1.3–3.2 into slabs or thick frames. The frames have scalloped, bumpy outer edges and half-block triangle teeth on the inner edge.
2. Broken junctions. 1-wide crossings split into a diamond plus detached arms, ladder rails disappear, and one added block necks a line to half width.
3. Dotted lines. A path at the foot of a grass step becomes a row of tiny squares, or vanishes at a 2-high step.
4. Blobs. Pixel letters and shapes melt into amoebas, and nearby dots fuse or swell depending on blocks 2–3 away. Edits therefore flicker in size and topology up to about 3 blocks out.
5. Ragged polylines on curved terrain, which is most of the world. Straight paint edges zig-zag with 15–25° median and up to 55° kinks, and a 1:2 line breaks.
6. Wobbly straight bands on walls, swallowtail line ends, club-footed stripes. Real terrain dirt bands turn into dashes and specks.

The owner rejected bevel because it 'adds its own type of jagginess'. This approach adds several, and they are more conspicuous than staircases because they break what the player built. The milder effects are tolerable or even pleasant: grass rounding 0.25–0.3 up fillets, rounded room corners, lumpy discs, square lone dots.

## Production risks

- The thin-feature guard is the root cause of the blocker failures. It cannot be tuned away: the team's own sweeps show a steep τ response (lines vanish at 0.52 and grow 2× at 0.58), and the boost ∝ 1/s makes the response non-monotonic near junctions. A different guard design would be needed, not a parameter change.
- Collision and picking (src/core/physics/collision.ts, pick.ts) read indexData as 6 indices per quad. Fans need a separate GPU index buffer next to a flipped, unfanned CPU collision buffer, and both must swap in the same frame (§9.4).
- The unedited GEN_MESH region grows from 38³ to 44³ (+55% cells). Measured worker time per unedited chunk goes from 9.6 to 18.4 ms (+91%, min-of-9 on this machine), which slows initial fill and sprint streaming.
- C-12 edit latency: +5.3 ms mean per remeshed chunk (up to 10 ms on bench terrain, 14 ms on a dense build). Estimate, not measured on device: the 8-chunk corner edit goes from about 22.7 to 28 ms per chunk, roughly 56 ms over 2 worker rounds. That is past both the 33 ms target and the 50 ms p95 escalation, while docs/conflicts.md already marks C-12 at risk.
- The vertex format uses all 30 spare bits, at 5 bits per material. Block ids are u8 and PLAN.md §18 defers 'more than 8 materials', so this scheme either caps the palette at 8 or forces a bigger vertex. Nothing is left for other per-vertex features, such as the gn team's AO work.
- Golden hashes are fragile. Symmetric player builds put codes exactly on Math.round half-steps (corner4: -7.5 vs -7.5000000000000018), so the proposed faster port must reproduce the summation order bit for bit or goldens and cross-version seams change. The prototype already disagrees with the fast path.
- Flips break the §7.2 'shorter diagonal' rule (twist ≤ 0.03), so mesher tests and goldens must change.
- The flip decision uses the ** operator in work/mf/fast.mjs, outside the '+ − × ÷ √' contract for stored data (the index buffer); production should use x*x.
- The sharp opt-out for crisp patterns also pins geometry: pattern blocks stick out as cubes on slopes. There is no way to get smooth ground with a crisp pattern.
- PLAN.md §18 lists 'soft material blending' as deferred past the MVP, so adopting this reopens a deferred item.
- GPU side is untested: fragment cost on the i7-1255U at 2 MP, and anti-aliasing. MSAA cannot smooth boundaries that run inside triangles, so without the fwidth blend and its second triplanar fetch the new smooth curves will alias.
- Harness gaps (for the orchestrator). seams.mjs cannot test the unedited apron: its world has shape edits, so --apron 6 reports base-mesher normal mismatches. It also skips y-borders. bench.mjs has no --out, so it writes into the target's folder; I used wrapper modules. The harness has no dense-pattern, junction, pixel-text or step-foot scenes, so every blocker found here is invisible to compare.mjs.

## Images (in the original run; not kept in this folder)

- out/vmf-adv/sheet-failures.png
- out/vmf-adv/stripes-d3-plan.png
- out/vmf-adv/dither-25-plan.png
- out/vmf-adv/checker16-plan.png
- out/vmf-adv/stripes-h2-plan.png
- out/vmf-adv/junctions.png
- out/vmf-adv/zoom-lines-X.png
- out/vmf-adv/pixel-text-plan.png
- out/vmf-adv/foot-lines.png
- out/vmf-adv/zoom-ends-and-foot.png
- out/vmf-adv/hill-lines-close.png
- out/vmf-adv/hill-line1-1:2-plan.png
- out/vmf-adv/zoom-hill-edge-1:2.png
- out/vmf-adv/pairs-hints-vs-mf-iso.png
- out/vmf-adv/sens-dline-mf-iso.png
- out/vmf-adv/wall-band-close.png
- out/vmf-adv/terrain-c111-close.png
- out/vmf-adv/hut-close0.png
- out/vmf-adv/zoom-junctions.png
- out/vmf-adv/zoom-checker16.png
- out/vmf-adv/sharp-optout-hill.png
- out/vmf-adv/planks-wall-on-grass-close0.png
- out/vmf-adv/wall-stripes-view.png
