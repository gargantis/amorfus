#!/usr/bin/env bash
# SessionStart hook: tell the session where it stands in git.
# Output is injected into the model's context. No network calls here.
set -u
repo="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$repo" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

branch=$(git branch --show-current 2>/dev/null)
[ -z "$branch" ] && branch="(detached HEAD)"

dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [ "$dirty" = "0" ]; then tree="clean"; else tree="$dirty uncommitted path(s)"; fi

state=""
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  state="a merge is in progress"
elif git rev-parse -q --verify REBASE_HEAD >/dev/null 2>&1; then
  state="a rebase is in progress"
fi

# main vs origin/main as of the last fetch (no fetch here).
mainpos=""
if git rev-parse -q --verify origin/main >/dev/null 2>&1; then
  ahead=$(git rev-list --count origin/main..main 2>/dev/null)
  behind=$(git rev-list --count main..origin/main 2>/dev/null)
  mainpos="main is $ahead ahead / $behind behind origin/main as of the last fetch."
fi

# Other local branches: how many commits they carry past main, and the
# first commit's subject, which is the branch's statement of purpose.
others=$(git for-each-ref --format='%(refname:short)' refs/heads/ \
  | grep -vx main | grep -vx -- "$branch" \
  | while read -r b; do
      n=$(git rev-list --count main.."$b" 2>/dev/null)
      if [ "$n" = "0" ]; then
        printf '  %s (nothing past main)\n' "$b"
      else
        subj=$(git log --reverse --format=%s main.."$b" 2>/dev/null | head -1)
        printf '  %s (%s past main: %s)\n' "$b" "$n" "$subj"
      fi
    done)

ctx="Git at session start: on branch '$branch', tree $tree"
[ -n "$state" ] && ctx="$ctx, $state"
ctx="$ctx."
[ -n "$mainpos" ] && ctx="$ctx $mainpos"
if [ "$branch" = "main" ]; then
  ctx="$ctx You are on main: before the first edit, create the session branch with 'git switch -c <topic>' (see .claude/rules/session-branches.md)."
else
  ctx="$ctx '$branch' is this session's branch. Confirm HEAD is still '$branch' before each edit; another session may have switched the checkout."
fi
if [ -n "$state" ]; then
  ctx="$ctx Resolve the in-progress operation first: /sync-with-main handles it."
fi
if [ -n "$others" ]; then
  ctx="$ctx
Other local branches:
$others"
fi

jq -cn --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'
