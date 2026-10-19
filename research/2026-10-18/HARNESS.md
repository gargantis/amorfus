# Smoothing study harness (scratchpad, not the repo)

Goal, in the owner's words: "I want minimal jagginess both on the surface
and also the boundary between differing blocks. The bevel rule adds its own
type of jagginess. The key is smoothness of boundaries. Investigate other
approaches if necessary."

## Layout

- `lib/mesher.mjs` — the repo mesher (branch bevel-smoothing-rule), bundled;
  byte-identical output, plus `corners`: each vertex's lattice corner.
  Its TypeScript source is in `lib/src/core/mesh/mesher.ts` (copy it to
  your work dir to patch, bundle with
  `cd <repo> && npx esbuild <file.ts> --bundle --format=esm --platform=node --outfile=<out.mjs>`).
  `lib/mesher-repo.mjs` is the untouched repo bundle. `lib/gen-mesh.mjs`
  is the generator + GEN_MESH input builder (`buildGenMeshInput`).
- `harness/core.mjs` — buildRegion, decodeMesh (plain mesh), mesh helpers.
- `harness/scenes.mjs` — the scenes (read it: every scene rasterises a
  known smooth shape into blocks; the ideal shape is the reference).
- `harness/raster.mjs` — plan-view rasteriser and perspective renderer
  (production lighting: Lambert sun + hemispheric ambient × AO; flat palette
  colours; 3×3 supersampling).
- `harness/metrics.mjs` — the metrics. `harness/run.mjs`, `harness/bench.mjs`,
  `harness/compare.mjs` — the tools below.
- `approaches/{cubes,hints,bevel}.mjs` — baselines; `out/<name>/` results
  (`out/` is not part of the record: run a baseline before comparing against it).

## Commands (run from this directory)

    node harness/run.mjs approaches/<file>.mjs [--only s1,s2] [--no-images]
    node harness/bench.mjs approaches/<file>.mjs       # real terrain: cost + 2 views
    node harness/compare.mjs cubes hints bevel <yours…> # side-by-side table

Images land in `out/<name>/img/<scene>-plan.png` (material scenes, plan
view, 32 px per block, faint block grid) and `<scene>-view.png`
(perspective). Look at them with the Read tool.

## Approach module contract

    export const name = '<prefix>-<variant>';   // also the out/ folder name
    export const describe = 'one line';
    export const apron = 10;                     // cells of context you need (default 10)
    export const flatShading = false;            // optional: shade every triangle flat
    export function mesh(region, scene, core) { … return plainMesh; }
    export function fragment(attrs, info, scene) { … return materialId; } // optional

- `region` = { nx, ny, nz, apron, blocks (u16), rho (f32), shapeEdited (u8) };
  the chunk occupies [apron, apron+32)³ of it; scene coords = chunk-local
  coords; `core.regionIndex(region, x, y, z)` maps scene cell → index.
- **Honesty rule:** `mesh()` may read only `region` (it gets `scene === null`
  in bench.mjs). Never read scene.plan / scene.ideal outside debugging.
- Plain mesh: { V, pos(f64×3), nrm(f64×3), mat(u8), flags(u8: bit0 sharp,
  bit1 faceted → flat-shaded), ao(f64), T, tri(u32×3), triQuad, quadCount,
  quadLower, quadAxis, quadSolidLower, corner(i32×3 | null) } —
  `core.decodeMesh(core.meshRegion({...region, params}))` makes one. You may
  add `attrs` (Float64Array, V × attrDim) and `attrDim`: the renderers
  interpolate them **linearly within each triangle** (what the GPU does) and
  pass them to `fragment(attrs, info, scene)`; `info` = { t, a, b, c (vertex
  ids; a is the provoking vertex for flat varyings), quad, w[3], x, y, z
  (world position), ownMat (the triangle's material) }. You may attach any
  per-mesh data to the mesh object for your fragment, but you must state how
  it would reach the GPU and its size.

## Metrics (blocks and degrees)

- Material boundaries, plan view: boundary points between the measured pair;
  signed distance to the ideal curve. **std = jaggedness** (spread about the
  boundary's own mean offset), **maxDev** = worst excursion, **mean** = offset.
  compare.mjs shows `std / maxDev` (worst boundary of the scene).
  Flags: A area off by > 25 %, C connectivity changed, P thin line pinches
  (min width < 0.15). `single`/`checker` show area and part count.
- Surfaces: shading-normal error vs the ideal surface (rms / max; smooth
  normals, or face normals where shading is flat), `ao` = AO roughness
  (each vertex's AO minus its neighbours' mean, rms; smooth geometry should
  have smooth AO). Outline scenes (terrace-*, tower-*): plan outline at
  mid-height vs the ideal curve, std / maxDev. results.json also has
  position error, face-normal error and crease angles.
- Constraint scenes must keep: floating block extent ≥ 0.40, pillar width
  ≥ 0.40, 1×2 tunnel width ≥ 0.70 and height ≥ 1.90, 2-high room gap ≥ 1.90,
  sharp faces exactly on their planes.

## Baselines

| scene | cubes | hints | bevel |
|---|---|---|---|
| edge-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| edge-1:8 | 0.299 / 0.516 | 0.299 / 0.516 | 0.234 / 0.396 |
| edge-1:5 | 0.283 / 0.487 | 0.283 / 0.487 | 0.192 / 0.303 |
| edge-1:3 | 0.271 / 0.481 | 0.271 / 0.481 | 0.129 / 0.170 |
| edge-1:2 | 0.258 / 0.440 | 0.258 / 0.440 | 0.065 / 0.119 |
| edge-2:3 | 0.276 / 0.554 | 0.276 / 0.554 | 0.119 / 0.218 |
| edge-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.000 / 0.000 |
| disc-r2.4 | 0.286 / 0.619 | 0.286 / 0.619 | 0.160 / 0.329 |
| disc-r4.3 | 0.272 / 0.580 | 0.272 / 0.580 | 0.173 / 0.399 |
| disc-r7.6 | 0.297 / 0.679 | 0.297 / 0.679 | 0.198 / 0.448 |
| line1-0deg | 0.000 / 0.000 | 0.000 / 0.000 | 0.000 / 0.000 |
| line1-1:1 | 0.204 / 0.343 CP | 0.204 / 0.343 CP | 0.102 / 0.166 ACP |
| line1-1:2 | 0.287 / 0.601 CP | 0.287 / 0.601 CP | 0.214 / 0.373 CP |
| line2-1:1 | 0.204 / 0.343 | 0.204 / 0.343 | 0.011 / 0.011 |
| square-6 | 0.000 / 0.000 | 0.000 / 0.000 | 0.072 / 0.208 |
| single | area ×1.00, 1 part | area ×1.00, 1 part | area ×0.25, 1 part A |
| checker | area ×1.00, 18 parts | area ×1.00, 18 parts | area ×0.74, 18 parts A |
| junction3 | 0.296 / 0.661 | 0.296 / 0.661 | 0.147 / 0.318 |
| hill-materials | 0.292 / 0.627 | 0.330 / 0.696 | 0.291 / 0.808 |
| ramp-1:1 | 45.0° / 45.0° ao 0.108 | 0.1° / 0.5° ao 0.103 | 17.0° / 18.4° ao 0.108 |
| ramp-1:2 | 43.0° / 63.4° ao 0.075 | 5.6° / 8.7° ao 0.076 | 24.5° / 33.8° ao 0.076 |
| ramp-1:4 | 34.2° / 76.0° ao 0.041 | 10.6° / 19.6° ao 0.041 | 22.0° / 46.3° ao 0.041 |
| ramp-1:8 | 30.0° / 82.9° ao 0.043 | 11.5° / 26.5° ao 0.029 | 20.2° / 53.2° ao 0.043 |
| ramp-diag-1:2.8 | 46.7° / 76.4° ao 0.070 | 8.1° / 15.8° ao 0.074 | 43.2° / 70.9° ao 0.072 |
| mound-r6.4 | 48.4° / 83.5° ao 0.069 | 7.8° / 20.8° ao 0.075 | 34.5° / 81.4° ao 0.070 |
| pit-r5.4 | 48.3° / 81.5° ao 0.132 | 9.4° / 32.4° ao 0.146 | 36.4° / 69.1° ao 0.132 |
| terrace-disc | 0.291 / 0.728 | 0.219 / 0.486 | 0.206 / 0.490 |
| terrace-1:2 | 0.261 / 0.447 | 0.133 / 0.243 | 0.088 / 0.206 |
| tower-r4.6 | 0.341 / 0.616 | 0.170 / 0.338 | 0.233 / 0.478 |
| hinted-slope-1:4 | 34.2° / 76.0° ao 0.041 | 0.0° / 0.0° ao 0.041 | 16.1° / 31.0° ao 0.041 |
| hinted-hill | 45.7° / 87.7° ao 0.061 | 0.8° / 2.8° ao 0.065 | 34.7° / 81.1° ao 0.061 |
| floating-block | ok 1.00 | ok 0.60 | ok 0.60 |
| pillar | ok 1.00 | ok 0.40 | ok 0.50 |
| tunnel-1x2 | ok 1.05 | ok 1.00 | ok 1.00 |
| roof-2-high | ok 2.00 | ok 1.90 | ok 2.00 |
| sharp-wall | ok 0.00 | ok 0.00 | ok 0.00 |
| mesh ms (all scenes) | 690 | 765 | 706 |

Two rows predate the round-1 thin-line metric change (below). Today's harness
gives line1-1:2 0.258 / 0.440 CP for cubes and hints and 0.173 / 0.328 CP for
bevel, and bevel 0.000 / 0.000 on line2-1:1 (noted when recording).

## Findings so far (measured)

1. Material boundaries are block staircases under both rules except the
   bevel rule's 1:1 seams: std ≈ 0.20–0.30 blocks at every slope and on discs.
   A 1-wide diagonal line splits into one part per block (pinches, P).
2. The bevel rule ignores hints, so generated terrain becomes terraces with
   45° risers and flat facets (hinted-slope-1:4: 16° rms vs 0° under hints;
   hinted-hill: 35° vs 0.8°).
3. On BUILT (shape-edited) staircases the D-3 clearance caps stop concave
   corners from moving out: the bevel rule's "1:1 stair = 45° plane" becomes
   alternating 27°/60° facets (ramp-1:1: 17° rms). The caps also limit the
   hints rule on built slopes (ramp-1:4/1:8: 11° rms, 20–27° max).
4. AO is counted from blocks in a 4×4×4 window anchored at the vertex's
   LATTICE corner, so perfectly smooth generated slopes show block-shaped AO
   bands (hinted-slope-1:4 is an exact plane yet AO roughness 0.041;
   compare out/hints/img/hill-materials-view.png with out/dbg-hill-noao.png).
5. Real generated terrain (bench views): AO stripes on smooth slopes, and
   stair-stepped grass/dirt and grass/sand boundaries.

## Production constraints (from PLAN.md and the code)

- Vertex: 16 bytes — xyz u16 at 1/256, AO u8, flags u8, octahedral normal
  snorm16×2, material u8, 3 reserved bytes. Vertices are shared per
  (corner, material) for smooth quads; sharp quads have their own.
- Anything stored in the mesh is hashed by golden tests and must match
  across chunks and browsers: only + − × ÷ √ and comparisons, fixed order
  (no exp, pow, trig, Math.hypot). Fragment-side math is exempt.
- Seams: a per-vertex value must come out identical from either chunk's
  region. GEN_MESH uses a 38³ region (apron 3) when no shape edit is within
  reach, else 52³ (apron 10). A wider kernel means a bigger region for every
  chunk (cost: generation + meshing ≈ 22 ms per 52³ chunk today, see bench).
- Triangles: budget 1.5 M at radius 192 (today ≈ 1.2 M).
- GPU: WebGPU core — no geometry/tessellation shaders, no primitive index;
  flat varyings come from the triangle's first vertex. Floor device: an
  i7-1255U iGPU at ~2 MP (Medium), so per-fragment work matters.
- Physics: collision and picking use the render triangles ("what you see is
  what you hit"); geometry changes move collision, material looks do not.
- Determinism and the golden hashes are part of the contract (C-10);
  goldens may be re-emitted until the generator freeze (D-24).

## Round 1 results (2026-10-18) and harness changes

New tools (run from this directory):

    node harness/seams.mjs approaches/<file>.mjs [--apron N]   # adjacent-chunk seam test, keyed by lattice corner
    node harness/timing.mjs [--n 9] a.mjs b.mjs …              # interleaved min-of-N timing on real terrain

- Thin-line scenes now score each band edge separately (worse side shown) and
  the ideal centre line is refitted through the chosen blocks' centres
  (rasterisation phase put the 1:2 line 0.18 off its blocks before).
- `run.mjs --only a,b` now updates those scenes inside an existing results.json.
- Timing on this shared machine is noisy: use harness/timing.mjs, not the
  bench mean, for cost claims. bench.mjs and run.mjs force one apron and
  bench terrain has NO edits: edited-path costs need your own edit bench.

Round 1 findings (full results in work-phaseA.json; modules in approaches/):

- mf-iso (strong, material vertex fields): per-corner Gaussian σ1.2 weights over
  surface blocks + self-support guard (τ 0.55) + diagonal flips/fans; 30 bits
  in the spare vertex bytes; apron 6. Straight edges 1:2–1:1 ≈ 0.00–0.02,
  1:5 0.054, 1:8 0.131; discs 0.13–0.15; 1-wide diagonal connected; square
  corners ROUND (0.19); lone block ×0.56; checker merges. Seams verified at apron 10.
- mx-contour (interrupted, partial): CPU per-surface-block contour reconstruction
  (crack chains, xBR saddles, corners kept, TLS lines over digital-straight
  windows), 64-bit code per block, fragment locates its block. Best numbers so
  far on shallow edges (1:8 0.048), crisp squares, lone block ×1.00, junction 0.029.
  Data path and cost not finished.
- mv-fit (interrupted, partial): fitted boundaries → per-vertex signed distances.
- gn-best (strong, shading): AO from a 4-wide box at the vertex's ACTUAL position
  over partial volume (generated: clamp(½+4ρ); edited: occupancy), quadratic
  onset; edit-zone normals = 3-ring mean on pre-relaxation positions. Removes AO
  bands (plane 0.041 → 0.000; real terrain stripes gone), smooths built-shape
  shading; positions untouched; seams verified.
- gs-mls / gs-ctx (promising, built geometry): CONTEXT-AWARE D-3 CAPS (cap only
  under headroom ≤ 2, across 1-wide gaps, and at the foot of walls ≥ 2 high —
  the "tall-foot" rule keeps 2-block rises unwalkable) + midpoint crossings at
  edited edges (a hidden defect: placed blocks on hinted ground floated
  0.23–0.39) + windowed quadric fit (gs-mls). Built ramps ≤ 1:4 become planes;
  1:8 still 6.7°; 1-high steps soften into ~3-block swells (look trade-off).
- gh-cc8 (interrupted, partial): contour-interpolated crossings for edited edges,
  k = 0, narrow-opening caps: ramps 1:4 0.7°, 1:8 3.8°, pit 7.5°; tower worse.
- gc (weak): curved refinement does not remove terraces; the D-3 caps, not
  refinement, bind built outlines. Not pursued.
- Survey (prior art) — top uncovered item: GENERATOR MATERIAL HINTS. Generated
  materials are thresholds of continuous generator fields (src/core/gen/v1/index.ts:
  sand where H ≤ SEA_LEVEL + 2; top/dirt/stone by depth); interpolating those
  fields per vertex would make generated boundaries smooth by construction
  (oracle: std ≤ 0.012). Also: two-channel (MSDF-like) per-vertex distances keep
  1-wide diagonals connected and square corners exact; one channel does not.

## Round 2 results (2026-10-19)

Full structured reports: work-phaseB.json (prototypes mx, mv, gh, gm;
verifications vmf, vgn, vgs).

Verdicts after adversarial review:
- mf-iso — PARTLY REFUTED (work/vmf). Great on natural terrain boundaries, but
  player paint breaks: dot/stripe/checker patterns flood into slabs (×1.3–3.2),
  1-wide crossings split, ladder rails vanish, pixel text melts, a 1-wide line
  at a step foot becomes dots, dots change size from blocks 3 away. Root cause:
  the self-support guard. Not recommended for player content.
- gn-best — AO half CONFIRMED robust (45 real chunks; caves keep dark cracks;
  bands gone). The edit-zone 3-ring NORMALS are REFUTED: thin builds (posts,
  fences, trunks) glow on their shadow side, halos around builds, inverted
  normals at joints, triplanar smear. Use the AO only (positions/normals as
  production). Art note: the quadratic onset removes small builds' contact
  shadows; gn-ao (linear onset) keeps them.
- gs-ctx / gs-mls — PARTLY REFUTED (work/vgs): a natural 1-block step plus a
  placed block on top becomes a walkable 2-block rise (containment broken);
  dense builds cost 2–11× hints; placed blocks melt into volcanoes/pillows.
- gh-cc8b (strong, NOT yet adversarially verified): synthetic crossings for
  edited edges (contour interpolation R = 8, mirror/cliff rules, plateau w0 = 1),
  k = 0, D-3 caps only at narrow openings. Exact built ramps (1:8 3.9°), crisp
  1-high steps (1.9 blocks), no float/moat, 36/36 physics incl. 2-block rises
  (walls stay vertical), edit cost +0.5–2.6 ms, apron 10, unedited path
  byte-identical. Weak spots: domes are piecewise planar, side scallops.
- gm-hint (strong): GENERATOR MATERIAL HINTS. The generator's continuous
  fields S = SEA+2−H (per column) and D = dTerrain (per block) go into 2×12-bit
  vertex codes; the fragment applies the v1 thresholds. Shore std vs the exact
  contour 0.329 → 0.019; costs ~1 ms/chunk, no apron growth, seam-exact.
  Look decision: the literal rule removes today's dirt stripes on slopes
  (gm-slope adds smooth exposures on steep ground instead). Needs a fallback
  for edited blocks (currently mf-iso with generated blocks as background).
- mv-quad (promising, NOT yet adversarially verified): fitted boundaries
  (DSS lines, corners/caps, max-margin arcs) as 2 per-vertex distances + 2
  other-material ids + AND/OR op in 3 bytes; per-quad choice with vertex
  duplication (+19 % vertices). Best scene numbers in the study (1:8 0.010,
  discs 0.05–0.10, crisp squares, checker kept, junction 0.015, hill 0.063).
  13.5 % of boundary-crossing quad edges show a small step; +18 ms/chunk JS;
  apron 10–12.
- mx-codes (promising, NOT yet adversarially verified): CPU contour
  reconstruction per surface block → 64-bit codes in a per-chunk texel volume
  + code array; fragment finds its block (1–3 loads) and tests ≤ 4 segments.
  1:8 0.042, crisp squares, checker kept, junction 0.034. Needs 52³ regions,
  new GPU data path (14–27 MiB at R = 192 in layout B), GPU cost unmeasured.

Reusable tools from the reviewers:
- work/vmf/adv-scenes.mjs (adversarial paint and 3-D scenes), work/vmf/harness-metrics.mjs
  (score them with the harness metrics for any modules), work/vmf/run-adv.mjs (images).
- work/vgs/battery-*.mjs, bypass-*.mjs, bypass-real.mjs (physics, containment bypass),
  work/vgs/editcost.mjs (dense-build edit cost), work/gh/phys/ (real-controller battery),
  work/gh/editbench2.mjs (edit-path cost), work/gh/seams-gh.mjs (apron-vs-24 seam test).
- work/gm/shim.mjs + gen-gm.mjs (generator planes for real chunks), work/gm/seams-gen.mjs,
  work/gm/terrain-metrics.mjs (real-terrain boundary metrics vs the exact contour).
- work/mv/apron2.mjs + edgecont.mjs (quad-aware seam/continuity), work/mx/seamcodes.mjs.
