#!/usr/bin/env bash
# PreToolUse(Bash) hook: main moves only by fast-forward.
# While HEAD is main, deny git commit / rebase / cherry-pick / revert, and
# deny git merge unless it is --ff-only (or an --abort/--continue/--quit).
# Session branches are untouched. Honors `git -C <path>`.
set -u
cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

git_re='(^|[^[:alnum:]_./-])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+'
sub=""
if   printf '%s' "$cmd" | grep -Eq "${git_re}commit([[:space:]]|$)";      then sub=commit
elif printf '%s' "$cmd" | grep -Eq "${git_re}rebase([[:space:]]|$)";      then sub=rebase
elif printf '%s' "$cmd" | grep -Eq "${git_re}cherry-pick([[:space:]]|$)"; then sub=cherry-pick
elif printf '%s' "$cmd" | grep -Eq "${git_re}revert([[:space:]]|$)";      then sub=revert
elif printf '%s' "$cmd" | grep -Eq "${git_re}merge([[:space:]]|$)";       then sub=merge
fi
[ -z "$sub" ] && exit 0

case "$sub" in
  merge)  printf '%s' "$cmd" | grep -Eq -- '--ff-only|--abort|--continue|--quit' && exit 0 ;;
  rebase) printf '%s' "$cmd" | grep -Eq -- '--abort|--quit' && exit 0 ;;
esac

# Which repo? `git -C <path>` if given, else the project directory.
repo=$(printf '%s' "$cmd" | grep -Eo 'git[[:space:]]+-C[[:space:]]+[^[:space:]]+' | head -1 | awk '{print $3}' | tr -d '"'"'")
repo="${repo:-${CLAUDE_PROJECT_DIR:-$PWD}}"
branch=$(git -C "$repo" branch --show-current 2>/dev/null) || exit 0
[ "$branch" = "main" ] || exit 0

reason="Refusing 'git $sub' on main. main moves only by fast-forward from a session branch: run /merge-to-main, or switch to a session branch first (git switch -c <topic>). See .claude/rules/session-branches.md."
jq -cn --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
