---
name: merge-to-main
description: Use when a session branch is ready to land on main — the user says "merge", "land this", "ship it", or "put this on main" — or when deciding whether a branch can be merged cleanly.
---

# Merge to Main

`main` moves only by fast-forward. **Clean** means two things, both checked
before anything moves: `main` can fast-forward to the branch, and the gate
(`npm run check`) passes on the branch tip. Rules: [session-branches.md](../../rules/session-branches.md).

## Steps

1. **Where are we.** `git branch --show-current` must not be `main`; record it
   as `B`. `git status --porcelain` must be empty — if not, commit first (it is
   your branch). If `git rev-parse -q --verify MERGE_HEAD` or
   `git rev-parse -q --verify REBASE_HEAD` succeeds, an operation is half done:
   stop and offer `/sync-with-main`, which recovers from it.
2. **Refresh main.** `git fetch origin`, then `git fetch origin main:main` to
   fast-forward local `main` without leaving the branch. If that refuses, local
   `main` holds commits origin lacks; report that and continue against local
   `main`.
3. **Fast-forward check.** `git merge-base --is-ancestor main B`. Exit 0: the
   branch contains `main`, so the merge is a fast-forward. Exit 1: `main` has
   moved since the branch was made — **not clean**; go to Report.
4. **Gate.** `npm run check` on the branch: lint, public-scan, typecheck, unit
   tests, build, wgsl, e2e — the repo's definition of done. The result of a
   fast-forward *is* the branch tip, so this checks the merged result. Any
   failure — **not clean**; go to Report.
5. **Land.** `git switch main`, then `git merge --ff-only B`. The guard hook
   allows exactly this form on `main`. Leave HEAD on `main`: a new session then
   starts from `main`, and if this session keeps working, its next edit creates
   a fresh branch per the rule table.
6. **Report.** `git log --oneline ORIG_HEAD..main` lists what landed. Say:
   branch, commit count, "fast-forward, gate passed", that `main` is now N
   ahead of `origin/main`, and that a push publishes it to origin and runs CI
   (push only on request). A push does not deploy: amorf.us deploys only
   through `npm run deploy`, run by the owner with an explicit go-ahead.
   The branch stays; never delete it.

## Report when not clean

Name the exact reason, then offer the fix in one line:

- `main` moved: `git log --oneline B..main` — "N commits on main are not in B.
  Run /sync-with-main, then /merge-to-main again."
- Gate failed: name the failing step and quote its first error line — "Fix on
  B, commit, rerun."

Nothing has moved at that point; no cleanup is needed.

## Do not

- No `git merge` without `--ff-only`, no `--no-ff`, no merge commits on `main`.
- No `git push`. Say that a push is needed and let the user ask.
- No branch deletion.
- No skipping the gate because "it passed earlier" — run it on the tip you are
  about to land. Never weaken the gate to make it pass.
