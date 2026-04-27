#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# update-security-digest.sh — maintain a single rolling "digest" issue that
# always shows the current security posture: open counts per source, trend,
# top severities, and a list of the oldest unresolved findings.
#
# One issue, updated in-place — no spam. Closes itself automatically when
# all sources hit zero, reopens when anything new appears.
#
# Required env: GH_TOKEN, TOTAL_OPEN, CQL_OPEN, DEP_OPEN, SEC_OPEN
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${TOTAL_OPEN:?required}"
: "${CQL_OPEN:?required}"
: "${DEP_OPEN:?required}"
: "${SEC_OPEN:?required}"

DIGEST_LABEL="security:digest"
DIGEST_TITLE="📊 [Security Digest] حالة الثغرات الحالية — يُحدَّث تلقائياً كل 4 ساعات"

gh label create "$DIGEST_LABEL" --color 0E8A16 --description "Rolling security status digest" 2>/dev/null || true

NOW=$(date -u +"%Y-%m-%d %H:%M UTC")
STATUS_EMOJI="🟢"
STATUS_LINE="✅ **كل الفحوصات نظيفة — لا ثغرات مفتوحة.**"

if [ "$TOTAL_OPEN" -gt 0 ]; then
  STATUS_EMOJI="🔴"
  STATUS_LINE="🔴 **يوجد ${TOTAL_OPEN} ثغرة مفتوحة — تتطلب اهتمام جلسة Claude القادمة.**"
fi

# Pull top 5 oldest open security:auto issues for the "next-up" list
TOP=$(gh issue list \
  --label security:auto \
  --state open \
  --limit 5 \
  --json number,title,createdAt \
  --jq '.[] | "- #\(.number) — \(.title) _(منذ \(.createdAt | sub("T.+";"")))_"' \
  | head -5)
[ -z "$TOP" ] && TOP="_(لا شيء)_"

BODY=$(cat <<EOF
> هذا Issue تلقائي يُحدَّث كل 4 ساعات بواسطة \`.github/workflows/security-sweep.yml\`.
> آخر تحديث: **${NOW}**

## ${STATUS_EMOJI} الحالة

${STATUS_LINE}

## العدّاد

| المصدر | المفتوحة |
|---|---|
| 🔍 Code scanning (CodeQL) | **${CQL_OPEN}** |
| 📦 Dependabot | **${DEP_OPEN}** |
| 🔑 Secret scanning | **${SEC_OPEN}** |
| **المجموع** | **${TOTAL_OPEN}** |

## أقدم 5 ثغرات تنتظر إصلاح

${TOP}

## كيف تعمل الحلقة

\`\`\`
كل 4 ساعات:
  1. security-sweep.yml يسحب جميع alerts من GitHub
  2. لكل alert غير مُتتبَّع → يفتح Issue بـ label security:auto
  3. للحرج → يضيف صف في governance/OPEN_ISSUES.md
  4. يحدّث هذا الـ digest

أي جلسة Claude:
  - تقرأ هذا الـ digest كأول خطوة (CLAUDE.md سطر 9)
  - تختار أعلى أولوية → تُصلحها → PR → merge
  - security-close-hook.yml يغلق الـ Issue ويحدّث الصف لـ ✅

→ الحلقة تستمر حتى \`TOTAL_OPEN = 0\` → هذا Issue يُغلق تلقائياً
\`\`\`

## روابط مباشرة

- [Code scanning alerts](https://github.com/${GITHUB_REPOSITORY}/security/code-scanning)
- [Dependabot alerts](https://github.com/${GITHUB_REPOSITORY}/security/dependabot)
- [Secret scanning alerts](https://github.com/${GITHUB_REPOSITORY}/security/secret-scanning)
- [كل security:auto issues](https://github.com/${GITHUB_REPOSITORY}/issues?q=is%3Aissue+label%3Asecurity%3Aauto)

---
_Auto-maintained by [\`scripts/update-security-digest.sh\`](../blob/main/scripts/update-security-digest.sh)_
EOF
)

# Find existing digest issue (any state — we may need to reopen)
EXISTING=$(gh issue list \
  --label "$DIGEST_LABEL" \
  --state all \
  --limit 1 \
  --json number,state \
  -q '.[0]')

NUM=$(echo "$EXISTING" | jq -r '.number // empty')
STATE=$(echo "$EXISTING" | jq -r '.state // empty')

if [ -z "$NUM" ]; then
  echo "→ creating digest issue"
  gh issue create \
    --title "$DIGEST_TITLE" \
    --body "$BODY" \
    --label "$DIGEST_LABEL"
elif [ "$TOTAL_OPEN" -eq 0 ]; then
  echo "→ all clear — updating digest and closing"
  gh issue edit "$NUM" --body "$BODY"
  if [ "$STATE" = "OPEN" ]; then
    gh issue close "$NUM" --reason completed --comment "✅ Auto-closed: zero open security alerts at ${NOW}."
  fi
else
  echo "→ updating digest #$NUM (open count: $TOTAL_OPEN)"
  gh issue edit "$NUM" --body "$BODY"
  if [ "$STATE" = "CLOSED" ]; then
    gh issue reopen "$NUM" --comment "🔴 Reopened: ${TOTAL_OPEN} new alerts detected at ${NOW}."
  fi
fi
