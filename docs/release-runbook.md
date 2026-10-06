# Release runbook (owner actions)

Everything the build cannot do by itself. PLAN.md §0: approval did not
authorise publishing — each first-time external action below needs your
explicit go-ahead at the moment you run it.

## One-time setup

1. **Credentials** (environment only, never the repo):
   `FILEBASE_KEY`, `FILEBASE_SECRET`, `FILEBASE_BUCKET`; a **narrowly
   scoped** Cloudflare API token for `wrangler deploy` (never the
   full-account login). Optional: `AMORFUS_PRIVATE_TERMS` pointing at
   your out-of-repo denylist for `public-scan`.
2. **GitHub Actions**: enable on the repo; the first push runs
   `.github/workflows/check.yml` — that run IS the M0 CI-adapter spike
   (D-17). If the `webgpu` e2e project or the `wgsl` step cannot run on
   hosted runners, wire `check:ci` that excludes exactly those, labelled
   partial; the local gate stays the definition of done.

## Sign-offs still pending (device/eye work)

- **D-1**: name the reference device, or confirm the fallback
  (i7-1255U, Medium at radius 160). Then run `?bench=flythrough` and
  `?bench=scenario-a` in Windows Chrome AND Edge and paste the reports
  into docs/acceptance.md — that agreement closes C-6.
- **M2 material look**: open `#scene=swatch` (Low and Medium) on the
  real device; sign off D-21.
- **M3 smoothing look**: open `#scene=gallery`; tune k / guard /
  clearance caps / hints if wanted; sign off D-3, D-4, C-8 — the
  constants live in `src/core/mesh/mesher.ts` DEFAULT_PARAMS.
- **D-2 networks**: the two-machine spike (M0) and the full matrix (M7)
  on the must-pass legs; record results in docs/acceptance.md. Scenario
  B (4 players, one joining 1e5 edits mid-run) on the same session.

## The release sequence (M8)

1. `npm run check:release` — gate, then kubo's independent re-chunking
   must reproduce the CID, then gateway smokes. The **SWG drive step**
   is still manual: serve `.cache/swg-3.4.15/dist` locally, point its
   `/#/ipfs-sw-config` gateway list at your local kubo (127.0.0.1:8080),
   open `/ipfs/<CID>/`, confirm the app boots. (The loader-contract
   rules themselves are covered by the kubo subdomain e2e.)
2. `npm run probe:relays` — 4 of 6 or stop.
3. **Freeze generator v1 (D-24)**: create the marker file
   `src/core/gen/v1/FROZEN` and commit it. From then on the golden
   emitters refuse to run — a changed hash is a determinism bug, never
   something to re-emit.
4. `AMORFUS_CONFIRM=yes npm run publish:ipfs` — uploads the CAR to
   Filebase, verifies the returned CID (the response header is the M0
   pipeline-spike confirmation), appends RELEASES.md.
5. Update the `_dnslink.amorf.us` TXT record by hand (D-6):
   `dnslink=/ipfs/<cid>`.
6. `npm run deploy` — amorf.us via Workers static assets.
7. `node scripts/verify-live.mjs <cid>` — the served HTML must
   hash-match dist exactly (C-15), routing must list a provider; then
   eyeball `https://inbrowser.link/ipfs/<cid>` (best effort, C-4).
8. **Handoff rehearsal** (M8 exit): publish a throwaway second CID and
   run the handoff from it (`#test=handoff-receiver` flow) through the
   local SWG and inbrowser.link.
9. Tag, and check every line of the amended REQUIREMENTS.md against
   docs/acceptance.md.
