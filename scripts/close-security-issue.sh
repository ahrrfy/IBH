#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# close-security-issue.sh — close the GitHub Issue for a resolved security alert
#
# Called by .github/workflows/security-close-hook.yml when an alert is
# dismissed / fixed / resolved. Closes the corresponding `security:auto` issue
# and patches governance/OPEN_ISSUES.md to mark it resolved.
#
# Usage:
#   bash scripts/close-security-issue.sh <KEY> <SHA>
#
#   KEY  — e.g. SEC-code-scanning-42  (matches the issue title)
#   SHA  — current git sha (used in the close comment for traceability)
#
# Env:
#   GH_TOKEN — GitHub token (passed by workflow)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

KEY="${1:?Usage: close-security-issue.sh <KEY> <SHA>}"
SHA="${2:?Usage: close-security-issue.sh <KEY> <SHA>}"

echo "→ Looking for open issue: $KEY"

# ── Find the open issue by title search ──
ISSUE_NUM=$(gh issue list \
  --label "security:auto" \
  --state open \
  --search "$KEY in:title" \
  --json number \
  -q '.[0].number' \
  --limit 1 || true)

if [ -z "$ISSUE_NUM" ]; then
  echo "  (no open issue found for $KEY — nothing to close)"
  exit 0
fi

echo "→ Closing issue #$ISSUE_NUM for $KEY (resolved at $SHA)"

gh issue comment "$ISSUE_NUM" --body "$(cat <<EOF
✅ **Alert resolved / dismissed**

This security finding (\`$KEY\`) was resolved at commit \`${SHA:0:8}\`.

Closing this issue. If the alert reopens, \`security-bridge.yml\` will
automatically reopen a new issue.

_Auto-closed by [.github/workflows/security-close-hook.yml](../.github/workflows/security-close-hook.yml)_
EOF
)"

gh issue close "$ISSUE_NUM" --reason completed

echo "→ Issue #$ISSUE_NUM closed"

# ── Patch governance/OPEN_ISSUES.md: mark this alert as resolved ──
# Only patch if the file exists and contains this alert key
if [ -f "governance/OPEN_ISSUES.md" ] && grep -q "$KEY" governance/OPEN_ISSUES.md; then
  echo "→ Patching governance/OPEN_ISSUES.md — marking $KEY resolved"

  BRANCH="bot/close-security-${KEY,,}"
  BRANCH="${BRANCH//[^a-z0-9-]/-}"

  git config user.name  "al-ruya-security-bot"
  git config user.email "security-bot@ibherp.cloud"
  git checkout -b "$BRANCH"

  # Replace the row's status cell (مفتوح) with resolved indicator
  sed -i "s|مفتوح — Issue #[0-9]*.*${KEY}.*|✅ محلول — ${KEY} resolved @ ${SHA:0:8}|g" governance/OPEN_ISSUES.md || true
  # Also try matching by KEY in the same line
  sed -i "/${KEY}/s/مفتوح/✅ محلول/g" governance/OPEN_ISSUES.md || true

  git add governance/OPEN_ISSUES.md
  git commit -m "chore(security): mark ${KEY} resolved in OPEN_ISSUES [skip ci]

Auto-patched by security-close-hook.yml. GitHub Issue #${ISSUE_NUM} closed.
Resolved at: ${SHA:0:8}" || { echo "nothing to commit"; git checkout main; exit 0; }

  git push origin "$BRANCH"

  PR_NUM=$(gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "chore(security): mark ${KEY} resolved in OPEN_ISSUES" \
    --body "Auto-PR from security-close-hook.yml. Marks the resolved finding \`${KEY}\` in governance/OPEN_ISSUES.md. Related GitHub Issue #${ISSUE_NUM} is now closed." \
    --label "security:auto,governance" \
    --json number -q .number || true)

  if [ -n "$PR_NUM" ]; then
    gh pr merge "$PR_NUM" --squash --auto || echo "auto-merge not available — leaving for human review"
  fi

  git checkout main 2>/dev/null || true
else
  echo "  (governance/OPEN_ISSUES.md does not reference $KEY — skipping patch)"
fi

echo "✓ done — $KEY closed"
