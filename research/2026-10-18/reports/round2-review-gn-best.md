# Adversarial review of gn-best (vgn, round 2)

Verdict: **partly-refuted**.

## Reproduction

Yes, except the edited-chunk cost. Matches exactly: all 36 harness scene results (out/vgn-repro/results.json equals out/gn-best/results.json apart from ms). Real-terrain AO roughness: mountain 0.072→0.021, beach 0.097→0.002, at aprons 3 and 10. The aocheck probes (wall foot 0.76/0.93, inside corner 0.55/0.63/0.81/0.84, ledge 0.70/0.70/0.83/0.93, gap 0.70, tunnel 0.55, open 1.00). Their flips.mjs output (pillar 12 vertices >45°, worst 69°, none >90°). Bench triangle/vertex counts 6099/3326. Unedited cost: I measure +0.70 ms at apron 3 (5.21→5.91) and +0.88 ms at apron 10 (10.47→11.35), against their +1.2 / +0.6. DIFFERS: they claim edited chunks cost 'about +3.3 ms, mostly fixed passes' (one block 15.1→18.4, house 18.6→21.8). Re-running their own work/gn/timing2.mjs gives +4.6 (block), +4.6 (mound), +6.8 ms (house). My three runs: one block +1.6..+4.6, house +4.8..+8.9. Cost grows with edit-zone vertices: fence maze +7.1..+11.4, scaffold +11.9..+17.3, 3000 random edits +8.4..+12.0 ms (×1.3–1.56). The 49.8 ms bench mean is just load: 28.4 ms in a quieter window.

## Claims checked

- [holds] Positions, indices, materials, flags and pick records are byte-identical to production; only the AO byte and normal bytes change
  - work/vgn/same.mjs: 60 inputs (36 scenes plus 24 generated chunks of seeds [1,1] and [7,7] at aprons 3 and 10). Zero byte differences outside bytes 6 and 8–11; positions, indices and picks identical. gn's default params also equal the repo bundle on all 60.
- [holds] Harness numbers (compare table): ramps 1:2 0.7°, 1:4 3.0°, diagonal 4.6°; AO roughness on the plane 0.041→0.000 and on the hill 0.065→0.000
  - node harness/run.mjs approaches/vgn-gnbest.mjs --out out/vgn-repro: 36 of 36 scenes identical to out/gn-best/results.json.
- [holds] Real-terrain AO stripes are gone (mountain 0.072→0.021, beach 0.097→0.002)
  - work/vgn/aorough-terrain.mjs is exact. Across 45 chunks (work/vgn/terrain-ao.mjs, 23 from seed [1,1] and 22 from [7,7]: caves, overhang chunks, cliffs, surface), open-surface AO roughness falls 0.0887→0.0095, caves 0.068→0.025. AO jumps across one edge (work/vgn/ao-jumps.mjs): >0.2 from 36,604 to 1,304; >0.3 from 1,333 to 54. Images out/vgn-terrain/ov-s7-*.png and cliff-s7-0,0,-3-a.png.
- [partly] AO keeps its purpose (concave edges, ledges, gaps, tunnels stay dark)
  - The aocheck probes reproduce, and deep cracks stay dark in cave renders (out/vgn-terrain/cave-*.png). But enclosed space gets lighter overall: cave mean AO 0.806→0.853 (vertices below 0.8 drop from 52.9% to 30.6%), overhangs 0.755→0.802 (67%→44%). Contact shadows of small builds vanish (work/vgn/contact.mjs): ground at the foot of a 1×1 post 0.96→1.00, a 1-wide fence 0.86→0.95, a 4×4 block 0.78→0.86.
- [fails] Edit-zone normals: 'No flips'
  - It holds only under their criterion (>90° from the production normal, on their scene set). Measured as rendered (shading normal facing into its own triangle, work/vgn/thin.mjs), inverted pairs rise from 24 to 504 over 7 thin builds: posts 0→96, table 0→84, beam 0→36, house 0→8, diagonal 1-wide wall 24→280. Every side normal of a 3-high 1×1 post is about (−0.04, 1, −0.04), 76–89° from production (work/vgn/pillar.mjs).
- [partly] Smooths built-shape shading (ramps, mound, tower lose terraces and lumps)
  - True for wide builds. Odd-slope ramps (work/vgn/ramps-odd.mjs) improve too: 2:3 AO roughness 0.090→0.028, 3:4 0.094→0.024. Shading creases on coplanar faces drop 6,441→2,646 (work/vgn/creases.mjs). False for 1–3-wide builds (posts, fences, trunks, table legs, diagonal walls): see newFailures.
- [holds] Seams verified at 3/3, 10/10 and mixed 10/3
  - With production's own apron selection: work/vgn/seams-mixed.mjs and seams-mixed2.mjs ran 298 configurations (x, y, z and diagonal pairs; edits 0–14 blocks from the border on either side; apron pairs 10/10, 10/3, 3/10, 3/3). Zero mismatches, with 170 shared border vertices confirmed on the ring path. harness/seams.mjs at apron 10: 0. Unedited chunks give identical bytes at apron 3 and 10 on 45 of 45 (work/vgn/apron-invariance.mjs), so REMESH at apron 10 matches GEN_MESH at apron 3.
- [holds] The production-shaped fast path is byte-identical to the reference path
  - work/vgn/fastsame.mjs: 24 new meshes (16 adversarial builds, plus 8 terrain chunks each with 400 random place/dig/sharp edits). Zero differences.
- [holds] Normals and AO agree across material splits
  - work/vgn/matsplit.mjs: 1,230 corners shared by two or more materials (striped walls, banded mound, checker ramp, sharp inlay, junction3, hill-materials). Zero disagreements.
- [holds] Unedited cost: +1.2 ms at apron 3, +0.6 ms at apron 10
  - node harness/timing.mjs --n 15 approaches/vgn-repo3.mjs approaches/vgn-gnbest3.mjs approaches/vgn-repo.mjs approaches/vgn-gnbest.mjs gives +0.70 ms and +0.88 ms.
- [fails] Edited chunks cost about +3.3 ms, mostly fixed passes
  - Their own timing2.mjs now reads +4.6 / +4.6 / +6.8 ms. work/vgn/timing-edit.mjs (min-of-15/25, three runs): house +4.8..+8.9 (×1.25–1.41), fence maze +7.1..+11.4, scaffold +11.9..+17.3 (36.9–48.3 ms for one chunk), 3000 random edits +8.4..+12.0. A chunk-corner edit (work/vgn/timing-corner.mjs) adds +24.7 ms (one block) to +30.4 ms (inside a house) summed over 8 chunks.
- [holds] Dirty set unchanged (reach 7 ≤ k+3)
  - src/game/edits.ts dirties every chunk whose corner range meets [b−9, b+10], which is exactly the apron-10 footprint. gn reads at most 7 blocks and only its region. The mixed-apron seam sweep agrees.
- [holds] Zero GPU cost; identical vertex and triangle counts
  - Bench: 6099 triangles and 3326 vertices per chunk, same as production. No layout change (same.mjs).
- [holds] Orthogonal to material approaches; mf-iso on top has no interaction
  - approaches/vgn-gnmf.mjs: 19 of 19 material scenes identical to mf-iso at apron 10. Geometry metrics identical to gn-best except terrace-disc, which is mf-iso's own fan effect (mf-iso alone gives the same). harness/seams.mjs at apron 10: 0 mismatches, attrs included. Images out/vgn-gnmf/img/cmp-*.png show mf-iso's boundaries unchanged and the AO stripes removed.
- [partly] No AO halo (one AO formula everywhere)
  - The AO alone creates no halo (vgn-aoq, which is gn-best's AO with production normals: brightest ground ×1.000). With the edit-zone normals, sun-side ground 1–2 blocks from a build is brighter than open ground (work/vgn/halo.mjs): tower ×1.028 mean at d=2 and ×1.081 at its brightest; mound ×1.079, fence ×1.048. Production never exceeds ×1.000.

## New failures

### [major] Thin builds glow on their shadow side and lose form: 1×1 posts, tree trunks, short columns, fences, table legs

The 3-ring wraps around any feature narrower than about 6 blocks and averages in the ground, so side normals point up. On a 3-high 1×1 post every side normal is about (−0.04, 1, −0.04). All 60 of 60 shadow-side post triangles get a sun term above 0.4. Shadow-side light rises by +0.80 against production's +0.18 for a 1-wide 3-high column; +0.54 on 100% of triangles for 2-wide; +0.38 for 3-wide; +0.52 for 1-wide 6-high. 3-high walls of any thickness brighten by +0.18–0.25 on 17–30% of their shadow-side area. Tall columns get a glowing foot about 3 blocks high. From the sun side, the end faces of fences and walls lose contrast with their sides. The cause is the edit-zone ring alone: gn-ao and gn-best's AO with production normals match production exactly (work/vgn/split.mjs).

Repro: cd . && node work/vgn/thin-detail.mjs && node work/vgn/pillar.mjs && node work/vgn/width.mjs && node work/vgn/thin.mjs --img  (scenes in work/vgn/thin-scenes.mjs)

Image: out/vgn-thin/posts-gap2-shadowside.png

### [major] Triplanar texture smear and wavy projection seams on thin builds (production shader weights follow the shading normal)

Share of vertical-face area whose top-projection weight exceeds 0.3: fence 0%→38%, posts 0%→100%, diagonal 1-wide wall 38%→100%, beam 0%→43%, ramp beside a sharp wall 0%→42%. In the renders, post and trunk sides become vertical streaks, block-edge lines vanish, and a wavy dark seam runs along the village fence. This is a new jaggy pattern the flat-palette harness cannot show. It is unconfirmed in the real renderer.

Repro: cd . && node work/vgn/triplanar.mjs && node work/vgn/village.mjs  (emulates terrain.wgsl: pow(|n|,4) weights, the 3% cut, uv = zy/xz/xy, with a procedural checker texture)

Image: out/vgn-thin/village-fence-closeup-triplanar.png

### [minor] Light halo around every build's base on the sun side (darker band on the far side)

Ground normals in the edit zone average with the build's outward-facing walls and tilt away from it. Ground light relative to open ground at d=1,2: tower 0.992/1.028 (production 0.893/0.986), brightest ×1.081; mound ×1.079; 4×4 block ×1.059; fence ×1.048. On the far side it drops to ×0.81–0.86. Production never exceeds ×1.000. The ring is visible in gn's own out/gn-best/img/cmp-tower.png and cmp-mound.png.

Repro: cd . && node work/vgn/halo.mjs && node work/vgn/halo-render.mjs

Image: out/vgn-thin/halo-tower-r4.6.png

### [minor] Inverted shading normals at junctions: table underside at the legs, beam-to-post joints, door lintels, diagonal walls

Shading normals facing into their own triangle rise from 24 to 504 pairs across 7 builds. At the table, the underside vertices beside each leg get n=(−0.27, 0.81, −0.51) against a face at (0.27, −0.96, 0), dot −0.86, so the underside is lit as if facing up. At the beam joints, dot −0.67. The worst crease on coplanar faces grows from 135° to 162° (house), 118° to 156° (beam) and 90° to 118° (tree). This refutes 'no flips' under a rendering criterion.

Repro: cd . && node work/vgn/thin.mjs && node work/vgn/inverted-where.mjs

Image: out/vgn-thin/table.png

### [minor] Contact shadows of small builds disappear (quadratic onset), so posts and fences look pasted on

Ground AO at distance 0/1 from the footprint: 1×1×3 post 0.96/0.96→1.00/1.00; 1-wide fence 0.86/0.88→0.95/0.95; single block 0.98→1.00; 4×4×3 block 0.78/0.91→0.86/0.97. The team acknowledged a thinner shadow at a wall foot (0.93 vs 0.85) but not its complete loss under small builds. Combined with the glow above, small builds lose every grounding cue.

Repro: cd . && node work/vgn/contact.mjs

Image: out/vgn-thin/posts-gap2.png

### [minor] Edited-chunk remesh cost is understated and grows with build density (C-12)

Claimed about +3.3 ms. Measured: one block +1.6..+4.6, house +4.8..+8.9, fence maze +7.1..+11.4, scaffold +11.9..+17.3 (one chunk at 36.9–48.3 ms against production's 25–34), 3000 random edits +8.4..+12.0. An 8-chunk corner edit adds +24.7 to +30.4 ms summed, about +11 ms on the critical path with 6 workers over 2 rounds. Node on a shared machine; ranges come from 3 runs.

Repro: cd . && node work/vgn/timing-edit.mjs 25 && node work/vgn/timing-corner.mjs 15 && node work/gn/timing2.mjs

Image: none


## Look assessment

gn-best has two halves, and they need opposite verdicts.

The AO half (box kernel at the actual vertex position over partial volume, quadratic onset) is a clear, robust improvement. Across 45 real chunks and 8 multi-chunk renders, the block-shaped AO dimples and stripes on generated hills are gone (ov-s7-3,1,1-b, cliff-s7-0,0,-3-a, village-a). Caves read cleaner, deep cracks stay dark, and built ramps lose their banding, odd slopes such as 2:3 included. I found no new terrain artefact: the remaining large AO jumps are rare and sit in crevices. Costs:
- Open terrain becomes almost AO-free (mean 0.930 to 0.996), so terrain reads flatter.
- Caves and overhangs are about +0.05 lighter.
- Small builds lose their contact shadow entirely.

These are art calls, not jaggies.

The edit-zone 3-ring normals add exactly the kind of new artefact the owner rejected bevel for:
- 1–3-wide builds lose their form. Posts, trunks, short columns, fences and diagonal 1-wide walls light uniformly like the ground, their shadow sides glow, and trunks get a bright lower band.
- Every build gets a soft bright ring on the ground on its sun side, visible in gn's own cmp-tower and cmp-mound.
- Table and beam undersides light up near their joints.
- In my emulation of the shader's triplanar texturing, those faces turn into vertical streaks with wavy projection seams along the fences, a new jaggy pattern the flat-palette harness cannot show (unconfirmed in the real renderer).

Wide builds (mound, tower, ramps) do look smoother.

Material boundaries, the owner's key issue, are untouched. mf-iso on top shows no interaction.

Mitigation I tried (an experiment, not a verified fix): gate the ring so members whose normal is more than 45° from the start vertex's are skipped and not expanded (work/vgn/src, approaches/vgn-gate70.mjs). It keeps every ramp number, improves the mound (9.3° to 6.9°) and pit (9.9° to 7.6°), and passes seams. It removes most of the glow: post shadow-side brightening falls from +0.80 to +0.25 (production +0.18), inverted normals from 504 to 126, the halo from ×1.081 to ×1.023. But the hard threshold puts a sawtooth of light and dark teeth along the tower's rim and base (out/vgn-gate70/img/cmp3-tower-r4.6-flat.png), so a soft weight is needed.

Recommendation: ship the AO half, and hold the ring normals until they pass these thin-build scenes, shadow-side views and a real-renderer texture check.

## Production risks

- C-12 edit latency: gn-best adds +1.6..+8.9 ms per typical edited-chunk remesh (+9–41%) and +7..+17 ms in dense builds; an 8-chunk corner edit adds +25–30 ms summed (about +11 ms on the critical path with 6 workers). The plan already flags C-12 as at risk on E-cores. The AO-only half costs roughly a third to two-thirds of the delta, and part of that is avoidable: with normalRule 'area' the pre-relaxation normal pass still runs while normalFromD0 is true.
- Triplanar texturing in terrain.wgsl weights its projections by pow(|shading normal|,4). Any normal-changing rule must be checked in the real renderer with real textures; the study renderer uses flat colours and cannot show it.
- AO now reads ρ for every block in a 6³ window, including interior blocks production never read. REMESH must keep reproducing hints exactly everywhere, which assembleRemeshInput does today (saturated hints become ±1). Any future compression or quantisation of stored hints would silently change AO bytes and break seams between remeshed and untouched chunks.
- Mesh goldens must be re-emitted. That is allowed before the D-24 freeze, but the AO byte now depends on a wider neighbourhood, so a golden mismatch will be harder to localise.
- Art sign-off needed: open terrain becomes nearly AO-free (bright sand saturates under flat sun), caves and overhangs are about +0.05 lighter on average, and small builds lose contact shadows.
- Test-coverage gap: the study's scenes have no posts, fences, trees, tables, beam joints or diagonal 1-wide walls, and the cameras mostly sit on the sun side. That is why the ring passed. work/vgn/thin-scenes.mjs adds 16 such builds.
- Any fix to the ring (a gate or weighting) changes visible output in new ways. The hard 45° gate I tried creates rim sawtooth, so a fix needs its own adversarial pass.

## Images (in the original run; not kept in this folder)

- out/vgn-thin/posts-gap2-shadowside.png
- out/vgn-thin/column-h3.png
- out/vgn-thin/column-h12.png
- out/vgn-thin/tree-shadowside.png
- out/vgn-thin/posts-gap2.png
- out/vgn-thin/fence-1w-3h.png
- out/vgn-thin/wall-diag-1w.png
- out/vgn-thin/table.png
- out/vgn-thin/village-fence-closeup-triplanar.png
- out/vgn-thin/posts-gap2-triplanar.png
- out/vgn-thin/tree-triplanar.png
- out/vgn-thin/wall-diag-1w-triplanar.png
- out/vgn-thin/halo-tower-r4.6.png
- out/vgn-thin/village-a.png
- out/vgn-thin/village-b.png
- out/vgn-thin/hillside-fence.png
- out/vgn-terrain/ov-s7-3,1,1-b.png
- out/vgn-terrain/ov-s7-4,1,2-a.png
- out/vgn-terrain/cliff-s7-0,0,-3-a.png
- out/vgn-terrain/cave-s7-a.png
- out/vgn-terrain/cave-s7-b.png
- out/vgn-gnmf/img/cmp-terrain-mountain.png
- out/vgn-gnmf/img/cmp-hill-materials.png
- out/vgn-gate70/img/cmp3-posts-gap2-flat.png
- out/vgn-gate70/img/cmp3-tower-r4.6-flat.png
- out/vgn-gate70/img/cmp3-tree-triplanar.png
