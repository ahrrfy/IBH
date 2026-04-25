#!/usr/bin/env bash
# Install git hooks:
#   - pre-commit: runs security-scan.sh on staged files
#   - post-merge: runs `prisma generate` if schema.prisma changed (closes I010 class)
# Run once after cloning the repo:
#   bash infra/scripts/install-git-hooks.sh

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"

# ── pre-commit ───────────────────────────────────────────────────────────────
PRE_COMMIT="$REPO_ROOT/.git/hooks/pre-commit"
cat > "$PRE_COMMIT" <<'EOF'
#!/usr/bin/env bash
# Auto-installed by infra/scripts/install-git-hooks.sh
bash infra/scripts/security-scan.sh --staged
EOF
chmod +x "$PRE_COMMIT"
echo "✓ pre-commit hook installed at $PRE_COMMIT"
echo "  Runs security-scan.sh --staged before every commit."

# ── post-merge ───────────────────────────────────────────────────────────────
# I010 root cause was a stale Prisma Client after schema.prisma was updated
# upstream. This hook regenerates the client whenever a merge/pull touches
# the schema, preventing the class of bug where build fails because
# node_modules holds an older generated client than the schema declares.
POST_MERGE="$REPO_ROOT/.git/hooks/post-merge"
cat > "$POST_MERGE" <<'EOF'
#!/usr/bin/env bash
# Auto-installed by infra/scripts/install-git-hooks.sh
# If schema.prisma changed in this merge, regenerate the Prisma Client.
CHANGED=$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD 2>/dev/null || true)
if echo "$CHANGED" | grep -qE 'apps/api/prisma/schema\.prisma$'; then
  echo "→ schema.prisma changed in this merge — running prisma generate…"
  if pnpm --filter api exec prisma generate; then
    echo "✓ Prisma Client regenerated."
  else
    echo "⚠ prisma generate failed — run manually: pnpm --filter api exec prisma generate" >&2
    exit 0  # Don't block the merge, just warn
  fi
fi
EOF
chmod +x "$POST_MERGE"
echo "✓ post-merge hook installed at $POST_MERGE"
echo "  Runs prisma generate when schema.prisma changes in a merge."
