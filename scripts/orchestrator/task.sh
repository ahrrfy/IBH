#!/usr/bin/env bash
#
# Atomic task orchestrator for parallel agents.
#
# Why:  multiple agents working in parallel cannot be coordinated by a
#       Markdown file. The only atomic primitive both Git and GitHub agree on
#       is "create a remote ref": `git push origin <branch>` either succeeds
#       (and is the only successful one) or fails. We use that as the lock.
#
# Subcommands:
#   task status              live state of every task in TASK_QUEUE.md
#   task claim [TID]         atomic claim. With no TID, smart-picks the next
#                            available task whose deps are met. Creates the
#                            branch + empty claim commit + Draft PR.
#   task complete            on the current task branch: typecheck, mark PR
#                            ready, auto-merge on green CI, delete the branch
#                            both remotely and locally.
#   task release             abandon the current task branch cleanly.
#
# Atomicity rules:
#   - Branch slug is derived deterministically from the task ID + title, so
#     every agent computes the same slug for the same task.
#   - `git push -u origin <slug>` is the lock. If two agents race, exactly
#     one push succeeds; the loser exits non-zero and picks another task.
#   - Status is read from Git/GitHub state, not from TASK_QUEUE.md, so there
#     is no markdown to edit and no merge conflicts on the queue file.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TASK_QUEUE="$ROOT/governance/TASK_QUEUE.md"
ORIGIN="${ORIGIN:-origin}"
BASE="${BASE:-main}"

usage() {
  cat <<EOF
Usage: bash scripts/orchestrator/task.sh <command> [args]

Commands:
  status                  show all tasks and their live states
  claim [TID]             smart-pick (or claim TID) atomically
  complete                merge current task PR + cleanup
  release                 abandon current task branch
  branch-of TID           print the deterministic branch slug for TID

Environment:
  ORIGIN  remote name (default: origin)
  BASE    base branch (default: main)
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }

# --- Task list parsing -------------------------------------------------------

# Emit one line per task: "TID|TITLE|DEPS_CSV|MARKER"
# MARKER is the Status declared in TASK_QUEUE.md (DONE/IN_PROGRESS/BLOCKED/SKIP/TODO).
# It is the fast path for historical tasks (T01-T30) that don't follow the
# orchestrator's deterministic branch slug. For new tasks the marker stays TODO
# and we fall through to git/gh state.
list_tasks() {
  awk '
    function flush(){ if (tid != "") print tid "|" title "|" deps "|" marker }
    /^#### T[0-9]+ — / {
      flush()
      hdr = $0
      sub(/^#### /, "", hdr)
      n = index(hdr, " — ")
      tid = substr(hdr, 1, n - 1)
      title = substr(hdr, n + 5)
      sub(/[[:space:]]*\(.*\)[[:space:]]*$/, "", title)
      deps = ""; marker = "TODO"
    }
    /^- \*\*Deps:\*\*/ {
      d = $0
      sub(/.*\[/, "", d); sub(/\].*/, "", d)
      # Keep only T<digits> tokens and commas. Strips emoji/✅ markers and whitespace.
      gsub(/[^A-Za-z0-9,]/, "", d)
      deps = d
    }
    /^- \*\*Status:\*\*/ {
      if      ($0 ~ /✅ DONE/)        marker = "DONE"
      else if ($0 ~ /🔄 IN_PROGRESS/) marker = "IN_PROGRESS"
      else if ($0 ~ /🚫 BLOCKED/)     marker = "BLOCKED"
      else if ($0 ~ /🟡 SKIP/)        marker = "SKIP"
    }
    END { flush() }
  ' "$TASK_QUEUE"
}

# Marker (queue-declared status) for a single task ID.
queue_marker() {
  list_tasks | awk -F'|' -v t="$1" '$1 == t { print $4; exit }'
}

# Slugify a string into a stable branch slug fragment.
slug_of() {
  echo "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | cut -c1-40 \
    | sed -E 's/-+$//'
}

# Branch name for a given task ID.
branch_of() {
  local tid="$1"
  local row
  row=$(list_tasks | awk -F'|' -v t="$tid" '$1 == t { print; exit }')
  [ -z "$row" ] && die "Unknown task: $tid"
  local title; title=$(echo "$row" | cut -d'|' -f2)
  local s; s=$(slug_of "$title")
  echo "feat/$(echo "$tid" | tr '[:upper:]' '[:lower:]')-${s}"
}

# Lookup status of a single task. Echoes one of:
#   DONE      — branch was merged at least once into main (closed PR found)
#   CLAIMED   — branch exists on remote and there is an open PR
#   ORPHAN    — branch exists on remote but no open PR (stuck claim)
#   AVAILABLE — neither
status_of() {
  local tid="$1"
  local branch; branch=$(branch_of "$tid")

  # Fast path: queue-declared DONE/SKIP — trust the queue, skip GitHub calls.
  local marker; marker=$(queue_marker "$tid")
  case "$marker" in
    DONE) echo "DONE|$branch|queue"; return;;
    SKIP) echo "SKIP|$branch|queue"; return;;
  esac

  # Open PR?
  local open_pr
  open_pr=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty' 2>/dev/null || echo "")

  # Remote branch exists?
  local has_remote=0
  if git ls-remote --heads "$ORIGIN" "$branch" 2>/dev/null | grep -q .; then
    has_remote=1
  fi

  if [ "$has_remote" = 1 ] && [ -n "$open_pr" ]; then
    echo "CLAIMED|$branch|PR#$open_pr"
    return
  fi
  if [ "$has_remote" = 1 ]; then
    echo "ORPHAN|$branch|no-open-pr"
    return
  fi

  # No remote branch — was it merged at some point?
  local merged_pr
  merged_pr=$(gh pr list --head "$branch" --state merged --json number --jq '.[0].number // empty' 2>/dev/null || echo "")
  if [ -n "$merged_pr" ]; then
    echo "DONE|$branch|PR#$merged_pr"
    return
  fi

  echo "AVAILABLE|$branch|"
}

# Are all of TID's deps DONE? Empty deps → yes.
deps_met() {
  local deps="$1"
  [ -z "$deps" ] && return 0
  local IFS=','
  for dep in $deps; do
    [ -z "$dep" ] && continue
    local s; s=$(status_of "$dep" | cut -d'|' -f1)
    [ "$s" != "DONE" ] && return 1
  done
  return 0
}

# --- Commands ----------------------------------------------------------------

cmd_status() {
  printf "%-6s %-50s %-10s %-20s %s\n" "TASK" "TITLE" "STATE" "REF" "DEPS"
  printf '%s\n' "$(printf '%.0s-' {1..120})"
  while IFS='|' read -r tid title deps marker; do
    [ -z "$tid" ] && continue
    local info state extra blocked
    info=$(status_of "$tid")
    state=$(echo "$info" | cut -d'|' -f1)
    extra=$(echo "$info" | cut -d'|' -f3)
    if [ "$state" = "AVAILABLE" ] && ! deps_met "$deps"; then
      state="BLOCKED"
      extra="deps:$deps"
    fi
    local short_title="${title:0:48}"
    printf "%-6s %-50s %-10s %-20s %s\n" "$tid" "$short_title" "$state" "$extra" "$deps"
  done < <(list_tasks)
}

# Pick first AVAILABLE task with met deps.
smart_pick() {
  while IFS='|' read -r tid title deps marker; do
    [ -z "$tid" ] && continue
    local info state
    info=$(status_of "$tid")
    state=$(echo "$info" | cut -d'|' -f1)
    [ "$state" = "AVAILABLE" ] || continue
    deps_met "$deps" || continue
    echo "$tid"
    return 0
  done < <(list_tasks)
  return 1
}

cmd_claim() {
  local tid="${1:-}"
  if [ -z "$tid" ]; then
    tid=$(smart_pick) || die "No available task with met deps"
    echo "Smart-picked: $tid"
  fi

  # Pre-flight: refuse if dirty
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "Working tree is dirty. Commit or stash first."
  fi

  # Ensure local main is up to date.
  git fetch "$ORIGIN" "$BASE" --quiet
  git checkout "$BASE" --quiet
  git reset --hard "$ORIGIN/$BASE" --quiet

  local info state branch
  info=$(status_of "$tid"); state=$(echo "$info" | cut -d'|' -f1)
  branch=$(branch_of "$tid")

  case "$state" in
    DONE)    die "$tid is already DONE — pick another";;
    CLAIMED) die "$tid is already CLAIMED ($info) — pick another";;
    ORPHAN)  die "$tid has an orphan branch on remote ($info). Run 'task release' on that branch first.";;
  esac

  # Validate deps from queue
  local deps
  deps=$(list_tasks | awk -F'|' -v t="$tid" '$1 == t { print $3; exit }')
  if ! deps_met "$deps"; then
    die "$tid has unmet deps: $deps"
  fi

  echo "Claiming $tid → $branch ..."
  git checkout -b "$branch"
  git commit --allow-empty -m "claim($tid): $(git config user.email) at $(date -u +%FT%TZ)"

  # ATOMIC CLAIM — first push wins on the GitHub side.
  if ! git push -u "$ORIGIN" "$branch" 2>&1; then
    git checkout "$BASE" --quiet
    git branch -D "$branch" >/dev/null 2>&1 || true
    die "Lost the race for $tid (branch $branch already exists on $ORIGIN). Re-run 'task claim'."
  fi

  # Open Draft PR.
  local title
  title=$(list_tasks | awk -F'|' -v t="$tid" '$1 == t { print $2; exit }')
  local pr_body
  pr_body=$(cat <<BODY
**Task:** $tid — $title
**Spec:** see \`governance/TASK_QUEUE.md\` § $tid
**Deps:** ${deps:-none}

This is an atomic claim opened by the orchestrator. Push commits to this branch and run \`bash scripts/orchestrator/task.sh complete\` when ready.

🤖 Auto-created via scripts/orchestrator/task.sh
BODY
)
  gh pr create --draft --base "$BASE" --head "$branch" \
    --title "$tid — $title" \
    --body "$pr_body" >/dev/null

  echo "✅ $tid claimed."
  echo "   branch: $branch"
  echo "   PR:     $(gh pr list --head "$branch" --state open --json number,url --jq '.[0].url')"
  echo
  echo "Work on this branch only. When done: bash scripts/orchestrator/task.sh complete"
}

cmd_complete() {
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)
  [[ "$branch" == feat/t* ]] || die "Not on a task branch (current: $branch)"

  # Push current state.
  git push "$ORIGIN" "$branch"

  local pr
  pr=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty')
  [ -z "$pr" ] && die "No open PR for $branch"

  # Local quality gates — agents cannot mark complete without these passing.
  echo "→ apps/api typecheck"
  ( cd "$ROOT/apps/api" && pnpm exec tsc --noEmit ) || die "API typecheck FAILED"
  echo "→ apps/web typecheck"
  ( cd "$ROOT/apps/web" && pnpm exec tsc --noEmit ) || die "Web typecheck FAILED"

  # Mark ready for review and request auto-merge once CI is green.
  gh pr ready "$pr" >/dev/null 2>&1 || true
  echo "→ Setting auto-merge on PR #$pr (will land when CI is green)"
  gh pr merge "$pr" --squash --delete-branch --auto

  # Wait for the merge to actually happen (poll).
  echo "→ Waiting for CI + merge ..."
  while true; do
    local s
    s=$(gh pr view "$pr" --json state --jq .state)
    case "$s" in
      MERGED) break;;
      CLOSED) die "PR #$pr was closed without being merged";;
    esac
    sleep 30
  done

  # Local cleanup.
  git checkout "$BASE" --quiet
  git pull --ff-only "$ORIGIN" "$BASE" --quiet
  git branch -D "$branch" >/dev/null 2>&1 || true

  echo "✅ Task complete. PR #$pr merged. Branch deleted."
}

cmd_release() {
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)
  [[ "$branch" == feat/t* ]] || die "Not on a task branch (current: $branch)"

  read -r -p "Release $branch? Open PR (if any) will be closed and the branch deleted. Type 'y' to confirm: " ans
  [ "$ans" = "y" ] || { echo "Aborted."; exit 0; }

  local pr
  pr=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty')
  if [ -n "$pr" ]; then
    gh pr close "$pr" --delete-branch
  else
    git push "$ORIGIN" --delete "$branch" 2>/dev/null || true
  fi

  git checkout "$BASE" --quiet
  git branch -D "$branch" >/dev/null 2>&1 || true
  echo "Released $branch."
}

# --- Dispatch ----------------------------------------------------------------

case "${1:-}" in
  status)    shift; cmd_status "$@" ;;
  claim)     shift; cmd_claim "$@" ;;
  complete)  shift; cmd_complete "$@" ;;
  release)   shift; cmd_release "$@" ;;
  branch-of) shift; branch_of "${1:?need TID}" ;;
  -h|--help|help|"") usage ;;
  *) usage; exit 1 ;;
esac
