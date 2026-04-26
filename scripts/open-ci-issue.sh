#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# open-ci-issue.sh — open or update a GitHub Issue for a CI/CD failure
#
# If an open issue with the same category label already exists, append a
# comment to it (don't spam). Otherwise, create a fresh issue.
#
# Required env: GH_TOKEN, RUN_URL, WORKFLOW_NAME, HEAD_SHA, CATEGORY, SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

LABEL_BASE="auto-diagnosed"
LABEL_CAT="ci-fail:${CATEGORY}"
TITLE="🔴 [${CATEGORY}] ${WORKFLOW_NAME} failed @ ${HEAD_SHA:0:7} — ${SUMMARY}"

# Ensure labels exist (idempotent)
gh label create "$LABEL_BASE" --color FF6B6B --description "Auto-opened by CI failure listener" 2>/dev/null || true
gh label create "$LABEL_CAT" --color FFE066 --description "CI failure category" 2>/dev/null || true

# Look for an existing OPEN issue with the same category label
EXISTING=$(gh issue list --label "$LABEL_CAT" --state open --json number,title --limit 1 -q '.[0].number' || true)

BODY=$(cat <<EOF
**Workflow:** ${WORKFLOW_NAME}
**Run:** ${RUN_URL}
**Commit:** \`${HEAD_SHA}\`
**Category:** \`${CATEGORY}\`

### Auto-diagnosis
${SUMMARY}

### For the next Claude Code session
1. Pull the run logs: \`gh run view ${RUN_URL##*/} --log-failed\`
2. Apply fix per category:
   - \`ssh-auth\` → re-check VPS authorized_keys vs the matching private key in \`VPS_SSH_KEY\` secret
   - \`ssh-host\` → re-set \`VPS_HOST\` secret with \`printf '%s' 'ibherp.cloud' | gh secret set VPS_HOST\`
   - \`docker-build\` → fix package issue, push
   - \`type-error\` → run \`pnpm --filter api exec tsc --noEmit\` locally, fix, push
   - \`migration\` → check \`apps/api/prisma/migrations/\` for the failing migration
   - \`health-fail\` → \`ssh root@ibherp.cloud 'cd /opt/al-ruya-erp/infra && docker compose -f docker-compose.bootstrap.yml logs api --tail=200'\`
   - \`nginx-conf\` → \`docker compose exec nginx nginx -t\` to see exact error
   - \`oom\` → reduce build parallelism or add VPS swap
3. Push fix → close this issue with the fix commit SHA

---
_Auto-opened by [.github/workflows/auto-diagnose.yml](../.github/workflows/auto-diagnose.yml)_
EOF
)

if [ -n "$EXISTING" ]; then
  echo "→ Found existing open issue #$EXISTING for $LABEL_CAT — appending comment"
  gh issue comment "$EXISTING" --body "$BODY"
else
  echo "→ Opening new issue"
  gh issue create \
    --title "$TITLE" \
    --body "$BODY" \
    --label "$LABEL_BASE,$LABEL_CAT"
fi
