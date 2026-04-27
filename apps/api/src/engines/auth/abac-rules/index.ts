/**
 * T47 — ABAC rule registry.
 *
 * ABAC rules are pure functions evaluated AFTER bitmask + temporal + SoD checks.
 * Each rule receives a typed context and returns a {@link AbacRuleResult}.
 *
 * Rules are intentionally tiny and deterministic — no DB calls inside the rule
 * body. If a rule needs persisted data, the caller passes it in via the context.
 */

export interface AbacContext {
  user: { userId: string; branchId?: string | null };
  resource: string;
  action: string;
  /** The target entity (id + plain attributes). */
  target?: Record<string, unknown> | undefined;
}

export type AbacRuleResult = { allowed: true } | { allowed: false; reasonAr: string };

export type AbacRule = (ctx: AbacContext) => AbacRuleResult;

export { cannotApproveOwnPo } from './cannot-approve-own-po';
export { branchIsolation } from './branch-isolation';
