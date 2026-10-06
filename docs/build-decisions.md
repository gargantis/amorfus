# Decisions made during the build

PLAN.md is the contract; this file records every place the build had to
decide something the plan did not settle, or depart from it. Each entry
says what was decided, why, and what it costs if the call was wrong.
Entries marked **superseded** were replaced later in the same build and
are kept so the history reads straight.

The decisions the owner still has to make or act on are not here — they
are in [release-runbook.md](release-runbook.md).

## How the build was run

- **Milestones were the unit of work.** PLAN.md is a design contract, not
  a task list, so M0–M8 were treated as tasks, each closed only with
  `npm run check` green. *Cost if wrong:* looser bookkeeping, nothing
  else.
- **Work stayed on the `setup` branch**, committed locally at every
  milestone and not pushed. *Cost if wrong:* a branch rename, or commits
  that wait for a push.
- **Nothing owner-gated was executed**: no Filebase pin, no amorf.us
  deploy, no DNSLink change, no two-machine network spike, no CI run, no
  real-GPU measurement, no look sign-off. The plan says approval does not
  authorise publishing. *Cost if wrong:* none; those items wait.
- **Config and static scaffolding were written without a failing test
  first** (tsconfig, Vite config, wrangler.jsonc, CI YAML, index.html
  text); everything with logic was test-first. *Cost if wrong:* a config
  typo caught by the gate rather than by a unit test.

## M0 — skeleton and gate

- **`.npmrc` sets `legacy-peer-deps=true`.** npm's default resolver
  crashes on this dependency graph. `npm ci` uses the lockfile and is
  unaffected. *Cost if wrong:* a hidden peer conflict, which the gate
  would surface.
- **`kubo-smoke` runs kubo inside one shell that owns the daemon.** An
  npx-wrapped daemon outlived its parent and hung the script.
- **`swg-smoke` builds and caches the pinned Service Worker Gateway but
  does not yet drive the app through it.** The drive step is a manual
  item in the release runbook. *Cost if wrong:* a loader problem found at
  release time; the kubo subdomain mount covers the observable loader
  rules meanwhile.
- **Fallback pages are tested by simulation**: no-WebGPU by deleting
  `navigator.gpu` before page scripts run, no-adapter with
  `--disable-gpu`. *Cost if wrong:* a fallback that behaves differently
  on real hardware.

## M1 — deterministic core

- **`EDITS` messages carry an explicit origin session.** The plan implies
  origin tracking for forwarding but never fixes the wire layout. *Cost
  if wrong:* a wire-format detail to revisit before the protocol freezes.
- **A chunk's hint state is independent of its storage kind.** Uniform
  chunks can still carry a hint plane, and deep chunks are usually not
  "saturated" because caves keep their hints live. *Cost if wrong:* more
  hint memory than the plan estimated.
- **Golden hashes and the file fixture come from guarded emitter tests**
  (`AMORFUS_EMIT_GOLDENS=1`). Re-emitting is legitimate only until the
  generator is frozen; the emitters refuse to run once
  `src/core/gen/v1/FROZEN` exists. *Cost if wrong:* an accidental re-emit
  before the freeze would silently rebase the goldens.
- **Worldless-joiner binding was deferred** to the multiplayer milestone.
  **Superseded:** it was then missed entirely; the final review caught
  that no two real installs could join each other, and it was built in
  the fix pass (see below).
- **The determinism lint exempts generator test files and two style
  rules in the vendored noise library.** The exact-operations rule still
  applies to the vendored file and passes.

## M2 — renderer

- **The interim world fill ran on the main thread** until the worker pool
  existed. **Superseded** at M4.
- **The interim mesher did not share vertices.** **Superseded** at M3.
- **The renderer is verified by Dawn pipeline creation plus the WebGPU
  e2e projects, not by unit tests of the wiring.** That matches the
  plan's test taxonomy. *Cost if wrong:* renderer regressions show up in
  the slower e2e layer.

## M3 — smoothing

- **Smooth normals accumulate per corner, not per (corner, material).**
  Vertices split per material for colour, but splitting normals too would
  shade a seam at every material boundary. *Cost if wrong:* re-emitting
  the mesh goldens.
- **REMESH falls back to GEN_MESH when an edit sits in a saturated
  chunk.** A saturated chunk cannot reveal what the generator put at an
  edited cell, which the smoothing rule needs. *Cost if wrong:* an
  occasional slower remesh; correctness is unaffected.
- **Generator v1 gained a cave-region mask** (`CAVE_MASK_MIN = 0.4`).
  This was a measured correction, not taste: without it caves honeycombed
  5.4 million triangles at radius 192 against a 1.5 million budget.
  *Cost if wrong:* the look changes at sign-off; the constant is tunable
  until the freeze.
- **The triangle, chunk and memory budgets are enforced in the gate** at
  the benchmark seed (1.5 M / 400 / 32 MiB). *Cost if wrong:* an
  over-budget world fails loudly, which is the intent.

## M4 — streaming

- **The dist audit scans JavaScript for external hosts in string
  literals only.** A URL in a comment cannot make a request, and a
  vendored licence header tripped the full-text scan. HTML and CSS are
  still scanned in full. *Cost if wrong:* a URL assembled at runtime
  evades the audit — which was always true; the e2e contact guard is the
  backstop.
- **"Uncapped" frame rate is a no-op**, because `requestAnimationFrame`
  cannot run without vsync. "Half" skips alternate frames.

## M5 — player and editing

- **Steep contacts slide against the horizontal part of their normal.**
  With the plan's 50° slope limit alone, the 41–51° faces that edited
  terrain leaves behind could be climbed by walking into them. With this
  rule the full physics battery passes and 50° / 0.6 step-up stand
  confirmed. *Cost if wrong:* climbing feels different from a plain slope
  projection; the gallery sign-off covers feel.
- **A newer edit took over the chunks of an unfinished transaction, and
  the older one swapped whatever it had left.** **Superseded** in the fix
  pass: that partial swap is exactly the visible crack the plan forbids,
  and the counter meant to detect it could not see it. Transactions now
  fold together and swap once.

## M6 — persistence

- **The second handoff origin in the tests is the real CID with one
  character changed.** Only the shape matters to the allowlist.
- **No migration machinery yet** beyond the version-1 upgrade; version
  errors and version-change events are handled. *Cost if wrong:* writing
  it at the first schema change, when its shape is known.
- **The worlds UI is the pause-menu row** (export, import, save as copy,
  status). A full world list screen is not built; the operations exist
  and are tested. *Cost if wrong:* a UI task, no data-model work.

## M7 — multiplayer

- **The "hostile peer cannot exhaust memory" property is verified by unit
  tests of the patched reassembly module**, imported directly so the gate
  fails if the patch is missing: the per-peer cap holds without a final
  chunk, accounting is released on completion, and unregistered message
  types are dropped. A browser-level simulation was not kept. *Cost if
  wrong:* the end-to-end disconnect path is exercised less directly.
- **Rejoining is tested by reloading the page.** Leaving and rejoining
  in place did not work, which was attributed to an upstream issue the
  plan's version pin already notes. That attribution is unverified — the
  wrong relays were in use at the time (see the fix pass). *Cost if
  wrong:* an in-place Leave → Join may need its own fix.
- **The "blocked pair" in the four-player test is a test hook** that
  refuses traffic with the first peer seen, on loopback hosts only. The
  gate cannot create a real network block. *Cost if wrong:* forwarding is
  exercised, NAT behaviour is not — that is the owner's network matrix.
- **One console line from the networking library is allow-listed** in
  the tests: its report of an expected, user-initiated channel close.
  *Cost if wrong:* a real error with that exact text would be masked.
- **Test-only network overrides work on loopback hosts only.**
- **The network tests got one retry.** **Superseded:** the flakiness was
  public-relay latency caused by the relay-list bug; with the local relay
  actually in use the tests are stable and run with no retries.

## M8 — release preparation

- **Driving the app through the Service Worker Gateway is manual**, as
  above.
- **Release execution is the owner's**: publishing, DNSLink, deploy, the
  generator freeze and the handoff rehearsal.

## Final review and fix pass

A fresh reviewer read the whole branch and found four critical defects
and a dozen important ones. Every one below was fixed; where the faulty
code still existed, a test was written and watched to fail first.

**Critical**

1. *The player could not move in the real game.* The frame loop read the
   elapsed time after overwriting the previous timestamp, so the timestep
   was effectively zero. No test drove the production loop. Fixed, and
   the gate now replays the whole walk/fly/edit script through it.
2. *Two real installs could never join each other.* Each sent its own
   random world id and refused the other's. A joiner now announces no
   world and binds to the first one offered; in the game it creates or
   opens that world and rejoins. The gate tests this with two separate
   installs, the real Host button and the real link.
3. *Every edit did work proportional to the whole edit log*, and remote
   edits started one remesh transaction each. Jobs now carry only their
   own neighbourhood's edits, remote remeshing is batched per frame, and
   incoming bulk data is applied within a time budget.
4. *A burst of edits on one chunk could lose the newest mesh.* Results
   were routed by chunk, so an older job's result could be delivered to a
   newer request and the real one dropped. Results now route by job.

**Important**

5. A forged clock value in the handshake could push a peer's clock far
   into the future. It is clamped to the same 60-second bound as edits.
6. Clock-ahead repair existed but was never called when opening a world,
   and stored data was read without validation. Both are wired in; a
   corrupt chunk now costs that chunk's edits instead of the world.
7. An edit landing while a chunk was still queued for its first mesh was
   missing from that mesh. Requests are now built when dispatched, and
   such chunks rerun.
8. Unloading a chunk could strand an edit transaction forever.
9. The set of chunks an edit dirties missed one neighbour at an exact
   alignment (1 in 32 per axis), leaving a crack until the next edit.
10. The split-swap counter could not detect the one case it existed for;
    folding (above) removes the case.
11. The generator canary was a constant compiled into the bundle, so it
    was identical on every engine. It is now computed at startup; a
    mismatch disables Host, Join and share export.
12. A local edit that lost to an existing entry was still shown,
    broadcast and saved, then silently reverted on reload.
13. Bulk sync had no back-pressure and split chunks in quadratic time
    (5.7 s for one full chunk; now linear).
14. Only a fixed band of chunks was loaded, and unloaded chunks collide
    as solid — an invisible ceiling 8 blocks above the tallest mountain.
    The band follows the camera.
15. The rate cap was keyed on a field the sender controls. There is now
    a per-connection total as well, and a bound on distinct origins.
16. The mesher used two operations the plan itself calls
    implementation-approximated, inside output the gate hashes.

**Found by the fix pass itself**

17. *The relay list was being ignored.* The test guard could not see
    WebSockets; once it could, it showed the app contacting the
    networking library's default public relays. The library reads
    `relayConfig.urls`; the code passed `relayUrls`. Production would
    have used relays the privacy sheet does not name. The config is now
    an object literal typed against the library, so a wrong key is a
    compile error, and every network and game test asserts zero
    non-loopback contact, WebSockets included.

**Decided not to fix now**

- *Deterministic admission* (the plan's rule for who is refused when a
  ninth player races in) is not implemented; a room refuses on a simple
  count. *Why it stands:* convergence is unaffected, and the effect is a
  brief asymmetric admission at the eight-player edge. *Cost if wrong:*
  a room can transiently exceed eight.

**Smaller findings left for later** (none changes what a player sees):
the close log and REFUSE handling are unbounded under spam; a "closed"
peer's WebRTC channel is not actually torn down; the licence check is
skipped if the licence file is missing entirely; multi-line template
strings escape the dist audit's host scan; the room secret is never
persisted, so the code is retyped each session even where the plan
allows keeping it; a hostile import file can create a world with a
nonsense seed rather than being refused; share files keep per-session
peer ids (no play times leak, but edits stay groupable by session);
storage listeners are added per attach without removal; handshake
retries never give up; non-minimal varints are accepted on decode.
