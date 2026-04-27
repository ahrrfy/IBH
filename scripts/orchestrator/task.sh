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

# --- Worktree helpers (I033 fix) --------------------------------------------
# Each task gets its own git worktree under $ROOT/.worktrees/<tid-lowercased>/.
# This is the only way to keep parallel agents from corrupting each other's
# HEAD/index when sharing the same checkout. See governance/OPEN_ISSUES.md §I033.

worktree_dir_of() {
  local tid_lc
  tid_lc=$(echo "$1" | tr '[:upper:]' '[:lower:]')
  echo "$ROOT/.worktrees/$tid_lc"
}

# Print the worktree path that has the given branch checked out, or empty.
worktree_path_for_branch() {
  git worktree list --porcelain | awk -v b="refs/heads/$1" '
    /^worktree / { p = $2 }
    /^branch /   { if ($2 == b) { print p; exit } }
  '
}

teardown_worktree() {
  local p="$1"
  if [ -n "$p" ] && [ -d "$p" ]; then
    git worktree remove --force "$p" 2>/dev/null || true
  fi
  git worktree prune --quiet 2>/dev/null || true
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

  # I033 root-cause guard — refuse to claim if a task branch is checked out
  # in the MAIN worktree itself (i.e., the user is mid-work in the shared
  # root and would corrupt that work). Sibling worktrees under .worktrees/
  # are isolated by design and don't trigger this — the new worktree-aware
  # cmd_claim creates a fresh sibling worktree per task, so concurrent
  # claims are safe. See PR #108 (original guard) and PR #115 (worktree
  # migration). The opt-in TASK_SINGLE_SESSION_LOCK below covers the
  # belt-and-suspenders case.
  local main_wt main_branch
  main_wt=$(git worktree list --porcelain | awk '/^worktree / {print $2; exit}')
  main_branch=$(git -C "$main_wt" symbolic-ref --short HEAD 2>/dev/null || true)
  if [[ "$main_branch" == feat/t* ]]; then
    die "Refusing to claim $tid — main worktree ($main_wt) is on task branch $main_branch.
Switch the main worktree back to $BASE first (or finish/release that task), then retry:
  git -C \"$main_wt\" checkout $BASE"
  fi

  # Optional belt-and-suspenders: hard-reject a 2nd concurrent claim on this
  # machine regardless of worktree isolation. Opt-in via env var.
  if [ "${TASK_SINGLE_SESSION_LOCK:-0}" = "1" ]; then
    local existing
    existing=$(git worktree list --porcelain \
      | awk '/^branch refs\/heads\/feat\/t/ {print substr($2, 12)}' \
      | head -1 || true)
    if [ -n "$existing" ]; then
      die "TASK_SINGLE_SESSION_LOCK=1: another task branch ($existing) is already checked out. Finish/release it before claiming a new one."
    fi
  fi

  # Ensure local refs are up to date (no checkout on the main worktree).
  git fetch "$ORIGIN" "$BASE" --quiet

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

  # Create an isolated worktree for this task — parallel agents cannot
  # corrupt each other's index/HEAD because each lives in its own directory.
  local wt
  wt=$(worktree_dir_of "$tid")
  mkdir -p "$ROOT/.worktrees"
  if [ -d "$wt" ]; then
    die "Worktree path already exists: $wt
Run 'bash scripts/orchestrator/task.sh release' from inside it, or remove it manually with 'git worktree remove --force $wt'."
  fi

  echo "Claiming $tid → $branch ..."
  echo "→ creating worktree: $wt"
  git worktree add -b "$branch" "$wt" "$ORIGIN/$BASE" --quiet \
    || die "Failed to create worktree at $wt"

  # ATOMIC CLAIM — first push wins on the GitHub side. Run from inside the
  # worktree so the claim commit lives on the new branch only.
  if ! ( cd "$wt" \
         && git commit --allow-empty -m "claim($tid): $(git config user.email) at $(date -u +%FT%TZ)" --quiet \
         && git push -u "$ORIGIN" "$branch" --quiet ); then
    teardown_worktree "$wt"
    git push "$ORIGIN" --delete "$branch" 2>/dev/null || true
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
  echo "   worktree: $wt"
  echo "   branch:   $branch"
  echo "   PR:       $(gh pr list --head "$branch" --state open --json number,url --jq '.[0].url')"
  echo
  echo "Next steps:"
  echo "  cd \"$wt\"     # all edits for $tid happen inside this worktree"
  echo "  # ... make changes, commit, push ..."
  echo "  bash $ROOT/scripts/orchestrator/task.sh complete"
}

cmd_complete() {
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)
  [[ "$branch" == feat/t* ]] || die "Not on a task branch (current: $branch)"

  # Locate the worktree for this branch. Modern claims live in
  # $ROOT/.worktrees/<tid>/; legacy claims (pre-I033) live in the main
  # worktree — those use the LEGACY_INPLACE=1 escape hatch below.
  local wt
  wt=$(worktree_path_for_branch "$branch")
  if [ -z "$wt" ]; then
    die "Could not find a worktree holding $branch. Run from inside the task worktree."
  fi
  local main_wt
  main_wt=$(git worktree list --porcelain | awk '/^worktree / {print $2; exit}')
  local legacy=0
  if [ "$wt" = "$main_wt" ] && [ "${LEGACY_INPLACE:-0}" = "1" ]; then
    legacy=1
    echo "⚠ LEGACY_INPLACE=1 — completing in main worktree (one-shot escape)"
  elif [ "$wt" = "$main_wt" ]; then
    die "$branch is checked out in the MAIN worktree ($main_wt) — that path is forbidden by the I033 fix.
Either move the work into a worktree, or set LEGACY_INPLACE=1 to bypass once."
  fi

  # Push current state from inside the worktree.
  ( cd "$wt" && git push "$ORIGIN" "$branch" )

  local pr
  pr=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty')
  [ -z "$pr" ] && die "No open PR for $branch"

  # Local quality gates — run inside the worktree, not the main checkout.
  echo "→ apps/api typecheck"
  ( cd "$wt/apps/api" && pnpm exec tsc --noEmit ) || die "API typecheck FAILED"
  echo "→ apps/web typecheck"
  ( cd "$wt/apps/web" && pnpm exec tsc --noEmit ) || die "Web typecheck FAILED"

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

  # Local cleanup. Tear down the worktree (or fall back for legacy mode).
  git fetch "$ORIGIN" "$BASE" --quiet
  if [ "$legacy" = 1 ]; then
    git checkout "$BASE" --quiet
    git pull --ff-only "$ORIGIN" "$BASE" --quiet
    git branch -D "$branch" >/dev/null 2>&1 || true
    echo "✅ Task complete (legacy path). PR #$pr merged. Branch deleted."
  else
    teardown_worktree "$wt"
    git branch -D "$branch" >/dev/null 2>&1 || true
    echo "✅ Task complete. PR #$pr merged. Worktree $wt removed."
  fi
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

  local wt main_wt
  wt=$(worktree_path_for_branch "$branch")
  main_wt=$(git worktree list --porcelain | awk '/^worktree / {print $2; exit}')

  if [ -n "$wt" ] && [ "$wt" != "$main_wt" ]; then
    teardown_worktree "$wt"
    git branch -D "$branch" >/dev/null 2>&1 || true
    echo "Released $branch (worktree $wt removed)."
  else
    # Legacy / main-worktree path — branch was checked out in the root.
    git checkout "$BASE" --quiet
    git branch -D "$branch" >/dev/null 2>&1 || true
    echo "Released $branch (legacy path)."
  fi
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
