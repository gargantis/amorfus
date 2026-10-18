---
name: sync-with-main
description: Use when a session branch has fallen behind main — /merge-to-main reported "not clean", main moved since the branch was made, a manual merge or rebase hit conflicts, or git status shows a merge or rebase in progress.
---

# Sync With Main

Brings `main` into the session branch so the next `/merge-to-main` is a
fast-forward. Default is rebase, which keeps history linear like `main`. Merge
instead when the branch has an upstream, so nothing already pushed is
rewritten. Rules: [session-branches.md](../../rules/session-branches.md).

## Steps

1. **Recover a half-done operation first.**
   - `git rev-parse -q --verify MERGE_HEAD` succeeds: a merge is in progress.
     On `main` (the user ran `git merge <branch>` there and hit conflicts):
     `git merge --abort`, `git switch <branch>`, continue at step 2. On the
     branch (a `git merge main` was started): resolve per step 5, then
     `git commit`; skip to step 6.
   - `git rev-parse -q --verify REBASE_HEAD` succeeds: a rebase is in
     progress. Resume at step 5.
2. **Where are we.** On a non-main branch `B` with a clean tree. Uncommitted
   work: commit it first.
3. **Refresh main.** `git fetch origin`, then `git fetch origin main:main`. If
   it refuses, local `main` holds unpushed commits; report and continue against
   local `main`. Then `git merge-base --is-ancestor main B` — exit 0 means
   already in sync: report and stop.
4. **Choose the mode.**
   - No upstream (`git rev-parse -q --verify B@{u}` fails): `git rebase main`.
   - Has upstream: `git merge main`. The fast-forward into `main` still works
     afterwards because B then contains `main`.
5. **Conflicts.** `git diff --name-only --diff-filter=U` lists them. Per file:
   - Both sides added or changed different things and both belong: keep both.
   - One side is a strict superset or an obvious rename of the other: take it.
   - The sides assert different things — a config value or relay entry, a
     ruling in `docs/build-decisions.md` or `docs/conflicts.md`, a golden
     hash, a codec or schema constant, a test expectation, user-facing copy:
     **stop**. Show both versions and ask. Never resolve by dropping one side
     silently.
   Then `git add <files>` and `git rebase --continue` (or `git commit` for a
   merge). Repeat until it finishes.
6. **Gate.** `npm run check`. If it fails, fix on B and commit; the sync is
   not done until it passes. Never weaken the gate to make it pass.
7. **Report.** `git log --oneline main..B` is what B still carries. Say: "B is
   synced with main (rebased|merged, N conflicts resolved in <files>);
   /merge-to-main will fast-forward."

## Do not

- No `git push --force`. Merge mode exists so it is never needed.
- No resolving a conflict by dropping one side's assertion without asking.
- No `git reset --hard` or `git checkout -- <file>` to escape a conflict. The
  exits are `git rebase --abort` and `git merge --abort`.
