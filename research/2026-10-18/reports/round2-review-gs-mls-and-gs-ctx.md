# Adversarial review of gs-mls and gs-ctx (vgs, round 2)

Verdict: **partly-refuted**.

## Reproduction

Yes for every headline number. harness/run.mjs --out out/vgs-repro-{hints,gs-ctx,gs-mls} produced, scene for scene, the same table as the team. gs-mls: ramp-1:2 0.4°, ramp-1:4 0.9°, ramp-1:8 6.7°, diagonal ramp 0.6°, mound 6.2°, pit 8.2°, terrace-1:2 0.007, terrace-disc 0.149, tower 0.158, roof 1.92. gs-ctx: 0.4° / 4.0° / 1.2° / 6.5° / 0.023. All constraint scenes pass and every material scene equals hints. The only differing cell is out/gs-ctx's stored line1-1:2 (0.287/0.601): it predates the harness change to the thin-line metric and now reads 0.258/0.440 for all three variants. Also reproduced exactly: the team's physics battery (hints, gs-ctx and gs-mls 24/24; gs-mls without tall-foot 20/24), the step tool (1-high step width 1.25→3.13 blocks, max slope 44.4°→17.0°, rDilate0 2.38 blocks / 27.6°, platform centre 7.11), and the seam tool (0 mismatches). The edit costs are in line on the team's own scenes: on this loaded machine, min of 9 interleaved runs, dense build +9.9 ms against their +7.8, ramp-1:4 +5.7 against their +4.9. Byte identity holds: unedited GEN_MESH chunks 32/32 (16 chunks × apron 3 and 10), default params 36/36 scenes, vertex and quad counts 36/36.

## Claims checked

- [holds] Headline scene metrics for gs-mls and gs-ctx (built ramps ≤1:4 become planes, mound, pit, terrace and tower outlines, all constraint scenes ok)
  - node harness/run.mjs approaches/gs-mls.mjs --out out/vgs-repro-gs-mls (and gs-ctx, hints); node harness/compare.mjs hints vgs-repro-hints gs-ctx vgs-repro-gs-ctx gs-mls vgs-repro-gs-mls: identical values.
- [holds] Physics 24/24 with the real §9.3 controller; tall-foot rule required (20/24 without)
  - node work/gs/tools/physics.mjs …: hints, gs-ctx and gs-mls 24/24, gs-mls with tallFoot:false 20/24. My own bundle of the REPO controller.ts and collision.ts (work/vgs/physics-real.mjs) agrees on every overlapping check.
- [fails] 2-block rises stay blocked (tall-foot cap), also sprinting, on binary and hinted ground at several phases
  - Fully placed 2-block rises stay blocked: 11 phases × walk, sprint, 30°/60° approaches, plus diagonal plan edges (battery-rises.mjs, bypass-diag.mjs E/F/G). But when the lower block of the rise is NATURAL and the upper is placed, the rise becomes walkable. Synthetic straight edge: hints blocks 11/11 phases, gs-ctx and gs-mls are walkable at 5/11. Diagonal edge: hints 3/11, gs-ctx 10/11 (+1 partial), gs-mls 11/11. Real generated terrain: 2/40, 17/40 and 13/40 edges climbed (hints, gs-ctx, gs-mls). Ablation: rDilate 0 closes it (0/11). See newFailures[0].
- [partly] Context caps keep D-3 clearance where needed; diagonal or irregular tight passages untested
  - battery-clear.mjs, 46 passages per variant. These pass with realistic steering, exactly as under hints: 1×2 tunnels straight, diagonal (1:1 both hands, 1:2, 2:1), zig-zag, T-junction, crossing, side niches, 2-wide then 1-wide; built roofed L-turn and diagonal; 1-wide gaps placed|placed straight, diagonal and zig-zag; doorways (1-thick, 2-thick, diagonal wall, beside a perpendicular wall, approached at 45°); roof 2 above natural ground at φ 0 to 0.49 incl. a diagonal edge and a corner; a 2-high room at 3 phases. The remaining failures are identical for cubes, hints and gs. Exception: at L-turns the outer corner column moves the full guard distance (−0.50, +0.50), to the centre of the corner cell, against 0.15 under D-3. A centre-line follower gets stuck there. 51/54 steering policies pass (54/54 under hints); the 3 failures are policies whose turn trigger now lies inside the chamfer.
- [holds] Built 1:1, 1:2, 1:4 staircases walkable with zero idle drift
  - Extended to 1:3 and 1:8, 9 spots × 60/20 Hz, mound flanks (16 spots) and walking down 1:1/1:2/1:4: drift 0.0 and no penetration in every variant (battery-stand.mjs, walkdown.mjs).
- [holds] Seam-exact at apron 10 (byte-identical at apron 8/9/10 vs 24)
  - Extended to a 3D chunk corner: 8 chunks around (32,32,32), edits and natural ground straddling the y=32 seam (work/vgs/seams3d.mjs). gs-mls at apron 8/9/10: 8/8 chunks identical to apron 24, 543 shared vertices, 0 position/normal/AO mismatches. The test is sensitive: at apron 6 it flags 5 position and 68 normal mismatches, at apron 4 80 and 108. harness/seams.mjs: 0 mismatches.
- [holds] Apron 10 suffices and the dirty set stays ≤ 8 chunks
  - reach.mjs, 30 single edits in a built quarter. Farthest changed vertex: hints b−4…b+5, gs-ctx b−6…b+6, gs-mls b−7…b+8, all inside the dirty range b−9…b+10. My derivation puts gs-mls's worst case exactly at b−9…b+10: R ±2, window 4 + normal ring 1, post-step 1, emitted normals 1. Holds, with zero slack.
- [holds] Unedited terrain byte-identical to hints, zero cost there
  - identity.mjs: 32/32 GEN_MESH chunk-aprons identical. harness/timing.mjs --n 7: hints 13.89, gs-ctx 13.76, gs-mls 13.76 ms mean.
- [holds] Vertex format, vertex and triangle counts unchanged; no GPU change
  - identity.mjs: gs-mls vertex and quad counts equal hints on 36/36 scenes. The gs path only moves CPU positions.
- [partly] Cost: context caps +0.6–2.6 ms; gs-mls +2.8–7.8 ms per edited chunk, ~4.7 µs per fitted vertex
  - On the team's own scenes, gs-ctx adds +1.3–1.9 ms and gs-mls +5.7–9.9 ms. On realistic dense builds (editcost.mjs, interleaved min of 7–9, 52³), hints → gs-mls: village of hollow houses 14.9→84.0 ms, lattice tower 38.0→201.7, strip mine 20.0→44.9; pathological builds +267 to +646 ms. gs-ctx alone adds +5.1 to +22 ms on the same builds. Measured 6–32 µs per fitted vertex. See newFailures[1].
- [holds] Midpoint crossings fix a hidden §7.1 float of placed blocks (0.23–0.39)
  - float.mjs, 4×4 placed slab on natural ground. With caps off and no editMid the top floats +0.19 (φ−0.3) to +0.29 (φ0.45); with editMid it is exactly 0.000. Production hints masks it (top −0.08 to −0.10). Physics: a player stands at 9.05 (hints) vs 9.00 (gs) on a placed rise.
- [holds] Isolated 1-high steps become ~3-block swells (width 1.25→3.13, 44°→17°); 6×6 platform centre 7.11
  - work/gs/tools/steps.mjs reproduced exactly. pillow.mjs: gs-mls bulges 6×6 and 8×8 floors +0.105 / +0.090, adds a +0.035 rim on 12–16 floors, and squashes 2×2 and 3×3 floors more than hints (−0.50 / −0.41 vs −0.47 / −0.35).
- [holds] Material boundaries unchanged from hints (does not fix the owner's main point)
  - All flat material scenes are identical and 1-wide diagonal lines still pinch (CP). Unclaimed small gain: on BUILT diagonal 1-high steps the plan-view stone|grass sawtooth shrinks (stepseam.mjs, std/max): 1:1 0.141/0.241 → 0.092–0.098/0.17, 1:2 0.191 → 0.123, 1:3 0.220 → 0.145–0.150. Still a block staircase.

## New failures

### [major] Tall-foot bypass: a 2-block rise made of a natural 1-block step plus a placed block on top becomes walkable

Scene A: hints blocks at 11/11 phases, gs-ctx and gs-mls are walkable at 5/11 (φ −0.15…+0.15), on plain walking with no jump. Scene D (diagonal edge x+z ≥ 28): hints walkable 3/11, gs-ctx 10/11 (+1 partial), gs-mls 11/11. 1:2 plan edge (bypass-diag.mjs H): hints 1/5, gs 5/5. Real terrain, 40 natural 1-block terrace edges with a 2×3 placed patch flush on the upper side: climbed by hints 2/40, gs-ctx 17/40, gs-mls 13/40. Riser profile at φ0: steepest segment 70° (hints) vs 45° (gs-ctx and gs-mls), so it is walkable under the 50° limit. Mechanism: tallFoot and every context cap apply only inside the D-3 zone. The foot cell of this riser holds only natural blocks, so it is outside the zone, yet it is in gs's R dilated by 1 (the placed block is Chebyshev-1 away). It is therefore relaxed or fitted with no cap. rDilate 0 closes scene A (0/11); capMode d3 does not (5/11). gs-ctx alone, which the team recommends adopting on its own, is the worst variant (17/40). Fully placed 2-high risers (straight and diagonal, binary and natural ground) stay blocked.

Repro: cd . && node work/vgs/bypass-sweep.mjs (synthetic phase sweep; scenes A straight / B wall on 45° hill / C 3-high / D diagonal) && node work/vgs/bypass-real.mjs 40 (real generated terrain, seed [1,1]) && node work/vgs/bypass-ablate.mjs (which ingredient) && node work/vgs/img-bypass.mjs (profile image). Scene A is a natural ground step 8+φ → 9+φ at x = 12 with one placed STONE row at y = 9 for x ≥ 12. The REAL controller walks east from x = 5.5.

Image: work/vgs/img/bypass-A-phase0-profile.png

### [major] Edit-path cost on dense builds is 2–11× hints, far above the claimed +2.8–7.8 ms (C-12)

hints → gs-ctx → gs-mls, ms per 52³ chunk. Village of 16 hollow 7×7 houses: 14.9 → 20.7 → 84.0 (5.6×). Lattice tower (beams every 4): 38.0 → 56.4 → 201.7. Strip mine (1×2 tunnels every 3): 20.0 → 25.0 → 44.9. Scaffold (beams every 3): 67.8 → 82.2 → 481.9. 35% rubble: 66.0 → 88.0 → 711.8. Dug cave sponge: 67.2 → 78.4 → 334.2. Team's dense build: 14.5 → 15.8 → 24.4. The fit visits 86–168 window points per fitted vertex (6–32 µs each, not 4.7); the context tests alone add 5–22 ms on these builds (not 0.6–2.6). A corner edit dirties up to 8 chunks, so a village edit costs ~670 ms of CPU against C-12's 33 ms p95.

Repro: cd work/vgs && N=9 node editcost.mjs && ONLY='strip|village|lattice' N=7 node editcost.mjs (one 52³ REMESH region, mesher only, interleaved across variants, min of N)

Image: none

### [minor] L-turn corners in 1-wide passages lose their clearance cap (cramped, not blocked)

Outer corner column of a 1×2 L-turn (dug, or built and roofed): offsets (−0.50, +0.50) under gs-ctx and gs-mls, i.e. at the corner cell's centre, against (−0.15, +0.15) under hints. gapTight is false on both axes in the corner cell. The capsule still passes when steering down the next arm: 51–54/54 policies against 54/54 under hints. A centre-line waypoint follower stops 0.31 short of the cell centre (first run of battery-clear.mjs: L-turns and Z-bend FAIL under gs only).

Repro: cd work/vgs && node cspace.mjs L-dug cubes,hints,gs-ctx,gs-mls 8.06 0.05 (prints corner vertex offsets) && node turns.mjs && node turns-fail.mjs

Image: none

### [minor] Look: placed blocks and floors melt into volcanoes and pillows

Lone placed block: footprint above the base +0.05 grows from 0.90 (hints) to 4.00 (gs-mls) on ground and 5.51 on a placed floor. A 2-high pillar stands on a 4.0-wide skirt (hints 0.90). 6×6 and 8×8 floors bulge +0.105/+0.090 (hints −0.028/−0.004). 12–16 floors get a +0.035 raised rim, a mild ringing ring. 1-high edges become ~3-block 17° swells; the team admits this.

Repro: cd work/vgs && node lone.mjs && node pillow.mjs && node look.mjs floor steps

Image: work/vgs/img/look-lone-block-on-floor-noao.png

### [minor] Look: boundary sawtooth and ragged hems stand out against the now-smooth bodies

Along a built diagonal 1-high step the stone|grass boundary is still a regular 1-block-period saw blade: plan std 0.092–0.098 vs hints 0.141. Under hints the riser's own shading scallops partly hide it; under gs the riser is smooth, so the teeth read as crisp. Towers, mounds and terrace discs become smooth bodies with a zigzag draped hem at the foot; gs-mls also domes the tower's flat top. Gentle built ramps (1:8) keep washboard terraces.

Repro: cd work/vgs && node look-diag.mjs && node look-ramps.mjs && node stepseam.mjs

Image: work/vgs/img/look-step-diag11-noao.png


## Look assessment

Fresh eyes, from the panels in work/vgs/img (hints | gs-ctx | gs-mls, with and without AO). gs is a real geometric gain on steep built slopes: 1:1–1:4 ramps and diagonal ramps become clean planes, and mounds become smooth domes instead of lumpy ones. It does not touch the owner's main point. Material boundaries and the 1-wide diagonal line are unchanged, and gentle built slopes (1:8) keep washboard bands.

The "swell" is not jagginess but melting. Every 1-high placed edge is a soft ~3-block ramp, a lone block is a 4–5.5-block volcano, 6–8-block floors are inflated pillows with pinched corners, and big floors get a faint raised rim. Built things stop reading as blocks; this is C-8 getting worse.

The new kind of jagginess is one of contrast. Because the body is now smooth, the block staircase that remains stands out. Along diagonal placed steps the stone/grass boundary is a crisp regular saw blade (its amplitude is ~35% lower than under hints, but hints' own scalloped riser used to camouflage it). At the base of towers, mounds and terrace discs it is a zigzag "draped hem", where the outline staircase meets ground. With production AO, block-anchored AO bands come back on the smooth ramps (the team's point). Kerbs, diagonal 1-wide kerbs, walls on slopes and houses look essentially like hints.

## Production risks

- The tall-foot bypass (newFailures[0]) breaks the Minecraft containment invariant: a 1-high wall or floor placed on a natural terrace edge can be walked up from below. gs-ctx, recommended as a cheap stand-alone step, is the worst variant. A fix must protect every relaxed vertex, e.g. dilate the D-3 zone with R or apply tallFoot to all of R, and must then be re-measured on real terrain (bypass-real.mjs), not only on synthetic binary scenes.
- C-12: gs-mls costs 5–11× hints on dense player builds (84–712 ms per 52³ chunk) and up to 8 chunks remesh per corner edit. A cost guard is needed: skip planar windows, cap window size, or fall back to Jacobi when R is dense. Measure it on a village or strip-mine edit benchmark, not on ramps.
- Dirty-set slack is gone: gs-mls's theoretical influence reach (b−9…b+10) equals the dirty range exactly (measured b−7…b+8). Any wider window, more post steps or more dilation silently breaks REMESH ≡ GEN_MESH unless K_REACH and FULL_APRON grow with it.
- Pre-existing in hints too, not caused by gs: a sprint-jump mounts a fully placed 2-block rise under hints, gs-ctx and gs-mls at every phase (cubes block it): battery-rises.mjs 'sprint+jump' rows.
- Pre-existing: 1:1 stairs inside 1–3-wide corridors or stairwells (dug or built between walls) cannot be climbed under hints or gs; open stairs climb fine (stairs-probe.mjs).
- Pre-existing: on a 1-thick floating slab, standing 0.15 from the edge falls off under every smooth rule (cubes holds); 1-thick 1-high placed walls squash to ~0.5-high bumps; diagonal natural-step + placed-row rises already leak under hints (3/11 phases, 2/40 real edges).
- The team's 24-check battery is axis-aligned and uses binary or all-placed risers. It cannot see the bypass. Add natural-lower-block rises, diagonal plan edges and real-terrain edges to the §14 battery before any default flip.

## Images (in the original run; not kept in this folder)

- work/vgs/img/bypass-A-phase0-profile.png
- work/vgs/img/bypass-A-phase0.3-profile.png
- work/vgs/img/look-step-diag11-noao.png
- work/vgs/img/look-step-diag11.png
- work/vgs/img/look-step-diag12-noao.png
- work/vgs/img/look-steps-1-noao.png
- work/vgs/img/look-lone-block-on-floor-noao.png
- work/vgs/img/look-floor-0-noao.png
- work/vgs/img/look-tower-r4.6-noao.png
- work/vgs/img/look-mound-r6.4-noao.png
- work/vgs/img/look-terrace-disc-noao.png
- work/vgs/img/look-ramp-1_8-noao.png
- work/vgs/img/look-stairswall-0-noao.png
- work/vgs/img/look-kerbs-0-noao.png
- work/vgs/img/look-wallslope-1-noao.png
