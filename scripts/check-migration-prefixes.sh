#!/usr/bin/env bash
# Guards against duplicate Prisma migration directory prefixes.
#
# Background: 4 migrations were merged in parallel sessions sharing the
# same '0012_' prefix (customer_rfm, t41_*, t46_notifications, t48_account_mapping).
# Prisma still orders these deterministically by full directory name, but
# the duplicate prefix is confusing and makes future bisecting harder.
#
# This script fails the build if any new prefix appears more than once.
# Existing duplicates (0012_*) are grandfathered to avoid breaking applied DBs;
# add new entries to the GRANDFATHERED list only after careful review.

set -euo pipefail

MIGRATIONS_DIR="apps/api/prisma/migrations"

# Known existing duplicates — applied to production DBs, cannot be renamed.
# Do NOT add to this list unless absolutely necessary.
GRANDFATHERED_PREFIXES=("0012")

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "ERROR: $MIGRATIONS_DIR not found"
  exit 1
fi

duplicates=$(
  ls -1 "$MIGRATIONS_DIR" \
    | grep -E '^[0-9]{4}_' \
    | sed -E 's/^([0-9]{4})_.*/\1/' \
    | sort \
    | uniq -c \
    | awk '$1 > 1 { print $2 }'
)

if [[ -z "$duplicates" ]]; then
  echo "OK: all migration prefixes are unique."
  exit 0
fi

new_dups=""
for prefix in $duplicates; do
  is_grandfathered=0
  for gf in "${GRANDFATHERED_PREFIXES[@]}"; do
    if [[ "$prefix" == "$gf" ]]; then
      is_grandfathered=1
      break
    fi
  done
  if [[ $is_grandfathered -eq 0 ]]; then
    new_dups+="$prefix "
  fi
done

if [[ -z "$new_dups" ]]; then
  echo "OK: only grandfathered duplicate prefixes remain (${GRANDFATHERED_PREFIXES[*]})."
  exit 0
fi

echo "ERROR: duplicate migration prefixes detected (NEW, not grandfathered):"
for prefix in $new_dups; do
  echo "  prefix '$prefix' used by:"
  ls -1 "$MIGRATIONS_DIR" | grep -E "^${prefix}_" | sed 's/^/    /'
done
echo
echo "Pick a unique prefix (next available after sorting all migrations) and rename"
echo "the new migration directory + its embedded migration_name reference (if any)."
exit 1
