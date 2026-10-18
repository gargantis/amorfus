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
  conflict register; `docs/build-decisions.md` records every build-time
  ruling and what it costs if wrong. Check all three before reopening a
  settled decision.
- A test harness that bypasses production wiring proves nothing about the
  product: both worst defects of the first build (a frozen player, joins
  that always refused) passed a green gate that way. New behaviour needs a
  test through `main.ts`, not only through a `#test=` mode.
- The networking library's config is built in `src/net/room-config.ts` as
  a literal typed against the library. Never spread untyped options into
  it — an unknown key is silently ignored and the library falls back to
  its own public relays.
- Every asset reference goes through the module graph, relative only; no
  History API; no service worker; no localStorage/caches for world data
  (§13.3 — the lint enforces this).
- `src/core` is pure TypeScript: no DOM, no GPU (lint enforces it).
- `src/core/gen/**` may use only the exact-ops allowlist; golden hashes pin
  every released generator forever (C-10).
- External actions — Filebase pin, amorf.us deploy, DNSLink — each need the
  owner's explicit go-ahead. `npm run deploy` and `npm run publish:ipfs`
  assume that go-ahead was given for this run.

## Branch workflow

Every session works on its own branch, created before the first edit and
kept after merging. `main` moves only by fast-forward through
`/merge-to-main`; `/sync-with-main` brings `main` into a branch that has
fallen behind. Questions, including prompts that start with "I want", get
answers rather than changes. Rules:
[.claude/rules/session-branches.md](.claude/rules/session-branches.md).

## Common commands

- `npm run dev` — local dev server on `http://localhost:5173`.
- `npm run check` — the gate; see above.
- `/merge-to-main` — fast-forward `main` to the session branch if the gate
  passes on its tip; `/sync-with-main` — bring `main` into the branch when it
  has fallen behind.

## Where to start a session

1. Check the branch. The SessionStart hook reports it: on `main`, the first
   edit creates the session branch; on another branch, that branch is the
   session's. See [session-branches.md](.claude/rules/session-branches.md).
2. Skim [.claude/rules/always.md](.claude/rules/always.md).
3. Before touching a settled decision, read PLAN.md, `docs/conflicts.md` and
   `docs/build-decisions.md` (see "Contracts that are easy to break").
4. Owner-only steps — pin, deploy, DNSLink, freeze — are in
   `docs/release-runbook.md`; never run them without a go-ahead.
