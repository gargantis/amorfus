# Amorfus — agent instructions

This repo is **public**. No host aliases, account names, key paths or other
identity details in any file, ever (D-7). `npm run public-scan` enforces the
built-in patterns; the private denylist lives outside the repo in
`$AMORFUS_PRIVATE_TERMS` and never enters it.

## The gate is the definition of done

```sh
npm run check
```

`lint && public-scan && typecheck && test && build && wgsl && e2e`. It must
pass before any commit lands and before any deploy or publish. **Never weaken
the gate to make a build pass** — fix the code. `npm run build` on its own
already refuses to emit a folder that breaks under an IPFS subpath
(`scripts/audit-dist.mjs`).

## Contracts that are easy to break

- PLAN.md is the implementation contract; `docs/conflicts.md` is the living
  conflict register. Check both before reopening a settled decision.
- Every asset reference goes through the module graph, relative only; no
  History API; no service worker; no localStorage/caches for world data
  (§13.3 — the lint enforces this).
- `src/core` is pure TypeScript: no DOM, no GPU (lint enforces it).
- `src/core/gen/**` may use only the exact-ops allowlist; golden hashes pin
  every released generator forever (C-10).
- External actions — Filebase pin, amorf.us deploy, DNSLink — each need the
  owner's explicit go-ahead. `npm run deploy` and `npm run publish:ipfs`
  assume that go-ahead was given for this run.
