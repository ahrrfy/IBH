#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# next-task.sh — يطبع أول مهمة TODO متاحة من TASK_QUEUE.md
#
# الاستخدام:
#   bash scripts/next-task.sh                # يطبع المهمة التالية
#   bash scripts/next-task.sh --json         # خرج JSON قابل للأتمتة
#   bash scripts/next-task.sh --all-todo     # يطبع كل المهام TODO
#
# المنطق:
#   1. يقرأ governance/TASK_QUEUE.md
#   2. يستخرج كل المهام بـ Status: ⏳ TODO
#   3. يصفّي تلك التي ملفاتها لا تتعارض مع entries في ACTIVE_SESSION_LOCKS.md
#   4. يطبع أول واحدة (أو كلها مع --all-todo)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

QUEUE_FILE="${QUEUE_FILE:-governance/TASK_QUEUE.md}"
LOCKS_FILE="${LOCKS_FILE:-governance/ACTIVE_SESSION_LOCKS.md}"
MODE="${1:-first}"

if [ ! -f "$QUEUE_FILE" ]; then
  echo "❌ Task queue not found: $QUEUE_FILE" >&2
  exit 1
fi

# Get list of locked file paths from ACTIVE_SESSION_LOCKS.md
locked_paths=()
if [ -f "$LOCKS_FILE" ]; then
  while IFS= read -r line; do
    # extract files: backtick-quoted patterns
    while [[ $line =~ \`([^\`]+)\` ]]; do
      locked_paths+=("${BASH_REMATCH[1]}")
      line="${line/${BASH_REMATCH[0]}/}"
    done
  done < <(grep -E "^\s*- \*\*T[0-9]+\*\*" "$LOCKS_FILE" 2>/dev/null || true)
fi

# Parse tasks: extract T## blocks where Status is TODO
awk -v mode="$MODE" -v locked_count="${#locked_paths[@]}" '
function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s; }

/^#### T[0-9]+/ {
  if (in_task && status == "TODO") {
    print_task();
  }
  in_task = 1;
  status = "";
  task_id = "";
  task_name = "";
  task_estimate = "";
  task_branch = "";
  match($0, /T[0-9]+/);
  task_id = substr($0, RSTART, RLENGTH);
  match($0, /— [^—]+$/);
  task_name = trim(substr($0, RSTART+2, RLENGTH-2));
  next;
}

/^### / && in_task {
  if (status == "TODO") print_task();
  in_task = 0;
}

in_task && /^- \*\*Status:\*\*/ {
  if (match($0, /TODO/)) status = "TODO";
  else if (match($0, /IN_PROGRESS/)) status = "IN_PROGRESS";
  else if (match($0, /DONE/)) status = "DONE";
  else if (match($0, /BLOCKED/)) status = "BLOCKED";
  else if (match($0, /SKIP/)) status = "SKIP";
}

in_task && /^- \*\*Branch:\*\*/ {
  match($0, /`[^`]+`/);
  if (RLENGTH > 0) task_branch = substr($0, RSTART+1, RLENGTH-2);
}

in_task && /^- \*\*Estimate:\*\*/ {
  match($0, /\*\* .+/);
  if (RLENGTH > 0) task_estimate = trim(substr($0, RSTART+3));
}

END {
  if (in_task && status == "TODO" && printed_count == 0) print_task();
  if (printed_count == 0) {
    print "✅ No TODO tasks available (or all are blocked/locked).";
    exit 1;
  }
}

function print_task() {
  printed_count++;
  if (mode == "--all-todo" || printed_count == 1 || mode != "first") {
    if (mode == "--json") {
      printf "{\"id\":\"%s\",\"name\":\"%s\",\"branch\":\"%s\",\"estimate\":\"%s\"}\n", task_id, task_name, task_branch, task_estimate;
    } else {
      printf "── %s ───────────────────────────────\n", task_id;
      printf "  Name:     %s\n", task_name;
      printf "  Branch:   %s\n", task_branch;
      printf "  Estimate: %s\n", task_estimate;
      printf "  Details:  see %s\n", "governance/TASK_QUEUE.md";
      print "";
    }
    if (mode == "first" || mode == "--json") exit 0;
  }
}
' "$QUEUE_FILE"
