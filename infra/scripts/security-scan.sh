#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# security-scan.sh — Static scan for accidentally-committed secrets.
# Runs on the staged files (pre-commit) or the whole repo (manual).
#
# Usage:
#   bash infra/scripts/security-scan.sh           # whole repo
#   bash infra/scripts/security-scan.sh --staged  # pre-commit
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

if [ "${1:-}" = "--staged" ]; then
  FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -vE '\.lock$|node_modules/|dist/|\.next/' || true)
else
  FILES=$(git ls-files | grep -vE '\.lock$|node_modules/|dist/|\.next/|package-lock\.json|pnpm-lock\.yaml' || true)
fi

[ -z "$FILES" ] && { echo -e "${GREEN}No files to scan${NC}"; exit 0; }

# Patterns that indicate likely secrets in source. Each line is regex.
PATTERNS=(
  # Generic high-entropy markers
  'password[[:space:]]*[:=][[:space:]]*["'\''][a-zA-Z0-9!@#\$%\^&\*]{8,}["'\'']'
  'api[_-]?key[[:space:]]*[:=][[:space:]]*["'\''][a-zA-Z0-9_\-]{20,}["'\'']'
  'secret[[:space:]]*[:=][[:space:]]*["'\''][a-zA-Z0-9_\-]{20,}["'\'']'
  'token[[:space:]]*[:=][[:space:]]*["'\''][a-zA-Z0-9_\-]{20,}["'\'']'
  # Private keys
  '-----BEGIN[[:space:]]+(RSA|OPENSSH|EC|DSA|PGP)[[:space:]]+PRIVATE[[:space:]]+KEY-----'
  # AWS-style
  'AKIA[0-9A-Z]{16}'
  # JWT secrets that look real
  'jwt[_-]?secret[[:space:]]*[:=][[:space:]]*["'\''][^C][a-zA-Z0-9!@#\$%\^&\*]{20,}["'\'']'
  # Specific known bad strings
  'admin123'
  'changeme[a-z0-9]*'
  # Bearer tokens
  'Bearer[[:space:]]+[A-Za-z0-9\._\-]{40,}'
)

ALLOW=(
  # Documented examples
  '\.env\.example'
  '\.env\.production\.example'
  'CHANGE_ME'
  'placeholder'
  'TEST_ADMIN_PASSWORD'
  'OWNER_PASSWORD='
  # This very file
  'security-scan\.sh'
)

declare -i found=0

for pattern in "${PATTERNS[@]}"; do
  while IFS= read -r match; do
    [ -z "$match" ] && continue
    skip=0
    for a in "${ALLOW[@]}"; do
      if echo "$match" | grep -qE "$a"; then skip=1; break; fi
    done
    [ $skip -eq 1 ] && continue
    echo -e "${RED}🚨 Possible secret:${NC} $match"
    found=$((found+1))
  done < <(echo "$FILES" | xargs -I {} grep -nIE "$pattern" {} 2>/dev/null || true)
done

if [ $found -eq 0 ]; then
  echo -e "${GREEN}✓ No secrets detected (${#PATTERNS[@]} patterns checked)${NC}"
  exit 0
fi
echo -e "\n${RED}❌ $found potential secret(s) found above. Remove or move to .env before committing.${NC}"
exit 1
