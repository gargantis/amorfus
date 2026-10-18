# Session Branches

Every Claude session contributes through its own development branch. `main` is
the release branch and moves only by fast-forward from a session branch. A
push of `main` runs CI (`.github/workflows/check.yml`) but deploys nothing:
amorf.us deploys from the laptop through `npm run deploy`, run by the owner
with an explicit go-ahead, and IPFS through `npm run publish:ipfs` the same
way. Several sessions can be open at once, each on its own branch, sharing one
checkout — which is why the branch check below runs before every edit, not
once per session.

## Questions are answered, not acted on

- A question gets an answer and no file changes — not code, docs, rules, or
  memory. If the answer surfaces something worth recording, say so in one
  line and record it in the next turn that makes changes.
- A prompt that starts with "I want" is a question about how to accomplish a
  goal. Answer with the approach — what you looked at, what you would change,
  what you are guessing — and stop. Build only when the user says to.

## Before the first edit of a turn

Run `git branch --show-current` and `git status --porcelain`, then:

| HEAD is | Tree | Do |
|---|---|---|
| `main` | clean | `git switch -c <topic>` **now**, before touching any file. Then edit. |
| `main` | dirty | Stop. Uncommitted work is sitting on main. Report the files and ask; do not branch over it, do not commit it. |
| this session's branch | any | Proceed. |
| another non-main branch, session already has a branch | clean | Another session switched the checkout. `git switch <ours>`, then proceed. |
| another non-main branch, session already has a branch | dirty | Stop and report — the dirty files belong to the other session. |
| a non-main branch, session has no branch yet | any | Adopt it as the session branch. Do not create another. |

## Naming

Lowercase kebab-case, two to four words naming the work, no prefix, no date:
`relay-probe-timeout`, `mesher-guard-caps`, `session-branch-workflow`. Check
`git branch -a` first; if the name is taken, add a distinguishing word (a
numeric suffix is the fallback). Git is the registry: the branch's first
commit subject states its purpose, `git branch --merged main` gives status,
and the SessionStart hook lists the open branches. Keep no registry file — a
tracked list would conflict on every merge.

## Commits

- Commit on the session branch as the work reaches coherent points, and
  always before the turn ends, so the tree is clean for another session to
  switch. Subject short and imperative, matching `git log`; body only when the
  why is not obvious from the diff; end with the attribution trailer the
  session specifies.
- Before committing, run `npm run check` and fix any failure first. The gate
  is the definition of done (CLAUDE.md); it must pass before any commit
  lands, and it is never weakened to make a build pass.
- Never commit on `main`. The PreToolUse hook `.claude/hooks/guard-main.sh`
  refuses `git commit`, `git rebase`, `git cherry-pick`, `git revert`, and any
  non-`--ff-only` `git merge` while HEAD is main.
- Push only when the user asks. Push is not in the allowlist, so it prompts;
  that prompt is the confirmation. A push of `main` publishes it to origin and
  runs CI; it does not deploy production.
- Branches are kept after merging. Never delete a branch.

## Landing and syncing

- `/merge-to-main` lands the session branch when it is clean: `main` can
  fast-forward to it and `npm run check` passes on its tip. Otherwise it stops
  and names the reason.
- `/sync-with-main` brings `main` into the branch (rebase by default, merge if
  the branch has an upstream) so the next `/merge-to-main` fast-forwards.
- When a merge to main has failed — `/merge-to-main` reported not clean, the
  user says a manual merge hit conflicts, or `git status` shows a merge or
  rebase in progress — offer `/sync-with-main` in one line.

## Plugins that stand down here

`superpowers:finishing-a-development-branch` (its merge/PR/discard menu and
branch deletion) and `superpowers:using-git-worktrees` (worktrees under
`.worktrees/`) do not apply in this repo. One checkout, branch switching, and
the two skills above.
