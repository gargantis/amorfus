# Conflicts register (living)

Moved here from PLAN.md §3 at M0, after the owner approved the plan on
2026-10-05. Numbers are permanent: a settled item keeps its number and
records what settled it. Full problem statements and evidence stay in
[PLAN.md §3](../PLAN.md); this file tracks status.

| # | Severity | Summary | Status |
|---|---|---|---|
| C-1 | Major | Serverless P2P cannot guarantee two machines connect | **Open** — accepted limitation. D-2 networks scope the test; M0 spike measures; bring-your-own-TURN (D-19). |
| C-2 | Major | Signaling is permanent third-party infrastructure; pinned builds freeze it | **Open** — accepted limitation. Six curated relays; user relays; link hints; `probe:relays` gates deploy/publish. |
| C-3 | Major | "Saves survive reloads" breaks down on IPFS origins | **Open** — accepted limitation. Stable origins + classifier + handoff sender (M6); export. |
| C-4 | Major | Public IPFS path gateways are gone (verified 2026-09) | **Settled by approval 2026-10-05.** Acceptance = local kubo + local SWG 3.4.15; public gateways best effort. |
| C-5 | Major | "Chrome and Edge" does not imply WebGPU; secure context required | **Settled by approval 2026-10-05.** Platform list amended into REQUIREMENTS.md; localhost rule; `dev:lan`. |
| C-6 | Major | "60 fps on mid-range hardware" not testable as written | Open — settled by **M2 measurement** into `docs/acceptance.md` (device D-1, scenarios A/B, frame-time criteria). |
| C-7 | Major | Block data alone cannot smooth gentle slopes | **Open** — accepted limitation for hand-built terrain (terrace stays; D-4). Generated terrain uses hints. |
| C-8 | Major | Smoothing fights single-block editability | Open — settled by **M3 sign-off** (guard, sharp toggle, picking UX, gallery). |
| C-9 | Major | Smooth collision shrinks block-sized openings | **Settled by M5 measurement (2026-10-05):** the three D-3 gate tests pass in the physics battery (tunnel walk-through, roof at hint phases, 1-wide gap); clearance caps 0.15/0.05 as planned. Feel still part of the owner's gallery sign-off. |
| C-10 | Major | Seed+edits needs bit-exact terrain everywhere, forever | **Settled by approval 2026-10-05.** CPU float64 allowlist, goldens in Node+Chromium, canary, frozen generators. |
| C-11 | Major | "Join via a link or code" vs offline brute-force | **Settled by approval 2026-10-05.** The code is the full 21-char secret (D-8). |
| C-12 | Major | "Immediately" + "no seams" + "must not stall" | Open — **M3 measured** 22.7 ms/chunk (52³, warm, gen incl.); 8-chunk corner edit ≈ 2 worker rounds. 33 ms p95 at risk on the floor device: M4 reserves an edit worker + REMESH drops generation; else escalate to 50/67 ms at M5 per plan. |
| C-13..C-24 | Minor | See PLAN.md §3 Minor table | **Settled by approval 2026-10-05**, each by its stated definition or trade-off. |

Update discipline: when a milestone settles an item, replace its Status with
what settled it and the date; never renumber; never delete a row.

## Notes

- **2026-10-06 (final review), C-2/C-15:** the app had been passing its
  relay list under a key the pinned Trystero ignores, so it used the
  library's default public relays instead of the six curated ones. Fixed
  (typed room config); the gate now asserts zero non-loopback contact,
  WebSockets included. The disclosed list and the contacted list are the
  same again.
- **2026-10-06, C-10:** the generator canary is now computed by the
  running engine at startup (it was a bundled constant, identical on
  every engine); a mismatch disables Host, Join and share export.
- **2026-10-06, C-12:** edit transactions fold on supersession, so the
  edit-to-visible metric now includes any folded wait. Under software
  rendering the gate replay shows edit p95 ≈ 0.4 s — a CPU-contention
  number, not the D-1 figure; the 33 ms decision still needs the device.
