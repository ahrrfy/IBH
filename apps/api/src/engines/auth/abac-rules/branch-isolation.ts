import type { AbacContext, AbacRuleResult } from './index';

/**
 * Branch isolation: when the acting user has a branchId AND the target entity
 * carries a branchId, the two must match. Super-tenant users (no branchId)
 * are unaffected. Targets without a branchId attribute are unaffected.
 *
 * This complements the per-user dataScope.ownBranchOnly flag — that flag
 * shapes QUERIES (read filtering), this rule blocks WRITES on out-of-scope
 * targets even when a user could fetch them via a sibling endpoint.
 */
export function branchIsolation(ctx: AbacContext): AbacRuleResult {
  const userBranch = ctx.user.branchId;
  if (!userBranch) return { allowed: true };

  const targetBranch = ctx.target?.['branchId'];
  if (typeof targetBranch !== 'string') return { allowed: true };

  if (targetBranch !== userBranch) {
    return {
      allowed: false,
      reasonAr: 'لا يمكنك التعامل مع سجل خارج فرعك',
    };
  }
  return { allowed: true };
}
