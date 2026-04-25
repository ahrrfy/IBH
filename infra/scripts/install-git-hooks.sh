#!/usr/bin/env bash
# Install git pre-commit hook that runs security-scan.sh on staged files.
# Run once after cloning the repo:
#   bash infra/scripts/install-git-hooks.sh

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="$REPO_ROOT/.git/hooks/pre-commit"

cat > "$HOOK" <<'EOF'
#!/usr/bin/env bash
# Auto-installed by infra/scripts/install-git-hooks.sh
bash infra/scripts/security-scan.sh --staged
EOF

chmod +x "$HOOK"
echo "✓ pre-commit hook installed at $HOOK"
echo "  It will run infra/scripts/security-scan.sh --staged before every commit."
