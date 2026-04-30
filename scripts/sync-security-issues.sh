#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-security-issues.sh — turn a GitHub Security alert into a governance task
#
# Mirrors the pattern of scripts/open-ci-issue.sh but for Security findings
# (CodeQL code_scanning_alert, Secret scanning, Dependabot). Called from
# .github/workflows/security-bridge.yml.
#
# What it does:
#   1. Classifies severity (critical | high | medium | low)
#   2. Maps the finding to which philosophy it violates (F1/F2/F3/...)
#   3. Opens (or updates) a GitHub Issue with label `security:auto`
#   4. For critical findings, also appends a row to governance/OPEN_ISSUES.md
#      via a bot commit on a separate branch (PR auto-mergeable).
#
# Required env:
#   GH_TOKEN          — passed by workflow (uses GITHUB_TOKEN)
#   ALERT_TYPE        — code-scanning | secret-scanning | dependabot
#   ALERT_NUMBER      — alert number from GitHub
#   ALERT_URL         — html_url of the alert
#   ALERT_RULE        — rule_id (e.g. js/sql-injection) or package name
#   ALERT_SEVERITY    — critical | high | medium | low | warning | error | note
#   ALERT_FILE        — affected path (may be empty for dependabot)
#   ALERT_LINE        — affected line (may be empty)
#   ALERT_SUMMARY     — one-line description from GitHub
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${ALERT_TYPE:?required}"
: "${ALERT_NUMBER:?required}"
: "${ALERT_URL:?required}"
: "${ALERT_RULE:?required}"
: "${ALERT_SEVERITY:?required}"
ALERT_FILE="${ALERT_FILE:-}"
ALERT_LINE="${ALERT_LINE:-}"
ALERT_SUMMARY="${ALERT_SUMMARY:-no summary provided}"

# ── Normalize severity (CodeQL uses error/warning/note, others use levels) ──
case "${ALERT_SEVERITY,,}" in
  critical|error)        SEV="critical" ;;
  high)                  SEV="high"     ;;
  medium|warning|moderate) SEV="medium" ;;
  low|note)              SEV="low"      ;;
  *)                     SEV="medium"   ;;  # safe default
esac

# ── Map rule → which of the 6 philosophies it threatens ──
# Extend this list as new patterns appear. Unknown rules → "غير مصنّف بعد".
philosophy_map() {
  case "$1" in
    js/sql-injection|js/missing-rate-limiting|js/path-injection)
      echo "F1 (Authorization) + F2 (Accounting integrity)" ;;
    js/xss*|js/reflected-xss|js/stored-xss)
      echo "F1 (Field-level security)" ;;
    js/hardcoded-credentials|js/clear-text-storage|generic-api-key|*-api-key)
      echo "F1 + F6 (Licensing/secrets)" ;;
    js/prototype-polluting-assignment|js/prototype-pollution*)
      echo "F1 + F4 (Operational integrity)" ;;
    js/insecure-randomness|js/weak-cryptographic-algorithm)
      echo "F1 + F6" ;;
    js/server-side-request-forgery|js/request-forgery)
      echo "F1 (Branch isolation)" ;;
    *prisma*|*nestjs*|*next*|*tauri*)
      echo "F1/F2/F3 (depends on usage — needs human review)" ;;
    *)
      echo "غير مصنّف بعد — راجع يدوياً" ;;
  esac
}
PHILOSOPHY=$(philosophy_map "$ALERT_RULE")

# ── Build issue title (Arabic for project consistency) ──
SEV_EMOJI=""
case "$SEV" in
  critical) SEV_EMOJI="🔴" ;;
  high)     SEV_EMOJI="🟠" ;;
  medium)   SEV_EMOJI="🟡" ;;
  low)      SEV_EMOJI="🟢" ;;
esac

TITLE="${SEV_EMOJI} [SEC-${ALERT_TYPE}-${ALERT_NUMBER}] ${ALERT_RULE} — ${ALERT_SUMMARY:0:80}"
LABEL_BASE="security:auto"
LABEL_SEV="security:${SEV}"
LABEL_TYPE="security:${ALERT_TYPE}"

# Idempotent label creation
gh label create "$LABEL_BASE" --color D73A4A --description "Auto-opened by security-bridge.yml" 2>/dev/null || true
gh label create "$LABEL_SEV"  --color B60205 --description "Severity: $SEV" 2>/dev/null || true
gh label create "$LABEL_TYPE" --color 5319E7 --description "Source: $ALERT_TYPE" 2>/dev/null || true

LOC=""
if [ -n "$ALERT_FILE" ]; then
  LOC="**Location:** \`${ALERT_FILE}${ALERT_LINE:+:$ALERT_LINE}\`"
fi

BODY=$(cat <<EOF
**Source:** \`${ALERT_TYPE}\`
**Alert:** ${ALERT_URL}
**Rule:** \`${ALERT_RULE}\`
**Severity:** **${SEV}** (raw: \`${ALERT_SEVERITY}\`)
${LOC}

### الوصف
${ALERT_SUMMARY}

### الفلسفات المعرّضة للخطر
${PHILOSOPHY}

### للجلسة القادمة (Claude Code)
1. اقرأ تفاصيل الـ alert: \`gh api repos/{owner}/{repo}/${ALERT_TYPE//-/_}_alerts/${ALERT_NUMBER}\`
2. افتح branch: \`git checkout -b fix/sec-${ALERT_TYPE}-${ALERT_NUMBER}\`
3. طبّق الإصلاح حسب نوع الثغرة:
   - \`sql-injection\` → استبدل raw SQL بـ Prisma parameterized query
   - \`xss\` → استخدم React default escaping أو DOMPurify على HTML معاد عرضه
   - \`hardcoded-credentials\` → انقل لـ env var، أضف لـ \`.env.example\`، دوّر السر
   - \`prototype-pollution\` → استبدل \`Object.assign({}, x)\` بـ structured clone أو زود recursive frozen
   - \`dependabot\` → غالباً \`pnpm up <pkg>\` كافي، شغّل \`pnpm test\` للتأكد
4. PR + CI أخضر → merge → الـ alert يُغلق تلقائياً
5. \`security-close-hook.yml\` يحدّث \`OPEN_ISSUES.md\` بعلامة ✅

### قواعد إلزامية
- ❌ لا تُغلق الـ alert يدوياً قبل دفع الإصلاح
- ❌ لا تستخدم \`gh issue close\` على هذا Issue قبل merge الـ PR
- ✅ اربط PR بهذا Issue بسطر \`Fixes #<num>\` في وصفه

---
_Auto-opened by [.github/workflows/security-bridge.yml](../.github/workflows/security-bridge.yml) · يتبع نمط \`auto-diagnose.yml\` للحلقة الذاتية_
EOF
)

# ── Look for existing OPEN issue for the same alert (idempotency) ──
EXISTING=$(gh issue list \
  --label "$LABEL_BASE" \
  --state open \
  --search "SEC-${ALERT_TYPE}-${ALERT_NUMBER} in:title" \
  --json number \
  -q '.[0].number' \
  --limit 1 || true)

if [ -n "$EXISTING" ]; then
  echo "→ Existing issue #$EXISTING for this alert — appending update comment"
  gh issue comment "$EXISTING" --body "Alert reopened or rescanned at $(date -u +%FT%TZ). See: $ALERT_URL"
  ISSUE_NUM="$EXISTING"
else
  echo "→ Opening new issue for SEC-${ALERT_TYPE}-${ALERT_NUMBER}"
  # `gh issue create` does not support --json output; capture the URL it
  # prints and extract the trailing issue number. (The earlier --json form
  # silently failed and the sweep mistakenly logged "sync failed" for every
  # alert, leaving 2 open CodeQL alerts untracked — see PR #232 fallout.)
  ISSUE_URL=$(gh issue create \
    --title "$TITLE" \
    --body "$BODY" \
    --label "$LABEL_BASE,$LABEL_SEV,$LABEL_TYPE")
  ISSUE_NUM="${ISSUE_URL##*/}"
  echo "→ Created issue #$ISSUE_NUM ($ISSUE_URL)"
fi

# ── For critical findings: also append to governance/OPEN_ISSUES.md ──
# Done on a bot branch + auto-merge so it doesn't conflict with active sessions.
if [ "$SEV" = "critical" ]; then
  echo "→ Critical severity — staging governance/OPEN_ISSUES.md update"

  BRANCH="bot/security-${ALERT_TYPE}-${ALERT_NUMBER}"
  git config user.name  "al-ruya-security-bot"
  git config user.email "security-bot@ibherp.cloud"
  git checkout -b "$BRANCH"

  ROW="| SEC-${ALERT_TYPE}-${ALERT_NUMBER} | ${ALERT_RULE} — ${ALERT_SUMMARY:0:60} | 🔴 حرج | Wave-current | Security Bot | مفتوح — Issue #${ISSUE_NUM} |"

  # Append before the closing line of the table (find the "## " section after).
  # Simple approach: just append at end of file under a new heading block.
  cat >> governance/OPEN_ISSUES.md <<APPEND

<!-- AUTO-INSERTED by sync-security-issues.sh @ $(date -u +%FT%TZ) -->
${ROW}
APPEND

  git add governance/OPEN_ISSUES.md
  git commit -m "chore(security): record SEC-${ALERT_TYPE}-${ALERT_NUMBER} in OPEN_ISSUES [skip ci]

Auto-recorded by security-bridge.yml. Tracking GitHub Issue #${ISSUE_NUM}.
Rule: ${ALERT_RULE}
Severity: ${SEV}" || { echo "nothing to commit (already recorded)"; exit 0; }

  git push origin "$BRANCH"

  gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "chore(security): record SEC-${ALERT_TYPE}-${ALERT_NUMBER} in OPEN_ISSUES" \
    --body "Auto-PR from security-bridge.yml. Records the critical finding from issue #${ISSUE_NUM} into governance/OPEN_ISSUES.md so the next Claude session sees it during the standard 8-step session-start protocol." \
    --label "security:auto,governance" || true

  # Best-effort auto-merge (squash). Falls back to human review if branch
  # protection requires approvals or if checks are still running.
  PR_NUM=$(gh pr list --head "$BRANCH" --json number -q '.[0].number')
  if [ -n "$PR_NUM" ]; then
    gh pr merge "$PR_NUM" --squash --auto || echo "auto-merge not available — leaving for human review"
  fi
fi

echo "✓ done — issue #$ISSUE_NUM"
