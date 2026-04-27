import type { AbacContext, AbacRuleResult } from './index';

/**
 * SoD-style ABAC rule: a user MUST NOT approve a Purchase Order that they
 * themselves created. This is the most common four-eyes principle in ERP
 * procurement, mandated by Iraqi audit norms for any vendor spend.
 *
 * Active when:
 *   - resource === 'PurchaseOrder'
 *   - action   === 'approve' (or 'Approve')
 *   - target.createdBy is present
 */
export function cannotApproveOwnPo(ctx: AbacContext): AbacRuleResult {
  if (ctx.resource !== 'PurchaseOrder') return { allowed: true };
  const action = ctx.action.toLowerCase();
  if (action !== 'approve') return { allowed: true };

  const createdBy = ctx.target?.['createdBy'];
  if (typeof createdBy !== 'string') return { allowed: true };

  if (createdBy === ctx.user.userId) {
    return {
      allowed: false,
      reasonAr: 'لا يمكنك اعتماد أمر شراء أنشأته بنفسك (مبدأ فصل المهام)',
    };
  }
  return { allowed: true };
}
