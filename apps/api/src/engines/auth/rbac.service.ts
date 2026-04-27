import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { PERMISSION_BIT, type PermissionAction } from '@erp/shared-types';

/**
 * T47 — RBAC Enterprise Service
 *
 * Extends the bitmask RBAC layer with three orthogonal checks:
 *   1. Role hierarchy — child inherits parent permissions (cycle-safe, depth ≤ 10).
 *   2. Temporal validity — role gates by validFrom/validUntil.
 *   3. Separation of Duties (SoD) — rejects an action if a conflicting
 *      action was performed by the same user on the same target entity
 *      within the lookback window (default 24h).
 *
 * All existing bitmask semantics are preserved. This service is purely additive:
 * callers OPT-IN by invoking `hasPermission` (or its specialized variants).
 */
@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  /** Maximum role hierarchy depth — guards against accidental cycles. */
  private static readonly MAX_HIERARCHY_DEPTH = 10;

  /** SoD lookback window when checking for conflicting prior actions. */
  private static readonly SOD_LOOKBACK_MS = 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Decide whether `userId` may perform `action` on `resource`.
   *
   * Optional `target` (entityType + entityId) enables SoD checks against
   * the audit log. Without `target`, SoD is skipped (legacy behaviour).
   *
   * Returns a structured decision so callers can distinguish denial reasons.
   */
  async hasPermission(
    userId: string,
    resource: string,
    action: PermissionAction,
    target?: { entityType: string; entityId: string },
  ): Promise<RbacDecision> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    if (userRoles.length === 0) {
      return { allowed: false, reason: 'NoRolesAssigned' };
    }

    const now = new Date();

    // 1. Walk hierarchy + collect effective permission masks.
    //    Child OR parent — child wins on collision (handled by walk order).
    const effective: Record<string, number> = {};
    const activeRoleIds: string[] = [];

    for (const ur of userRoles) {
      const role = ur.role;
      if (!role) continue;

      // 2. Temporal validity — gate at the assigned-role level.
      if (role.validFrom && now < role.validFrom) continue;
      if (role.validUntil && now > role.validUntil) continue;

      activeRoleIds.push(role.id);

      const merged = await this.collectHierarchyPermissions(role.id, now);
      for (const [res, mask] of Object.entries(merged)) {
        effective[res] = (effective[res] ?? 0) | mask;
      }
    }

    if (activeRoleIds.length === 0) {
      return { allowed: false, reason: 'TemporalRoleInvalid' };
    }

    // 3. Bitmask check.
    const bit = PERMISSION_BIT[action as string];
    const mask = effective[resource] ?? 0;
    if (!bit) {
      // Unknown action — require explicit non-zero entry on the resource.
      if (mask === 0) return { allowed: false, reason: 'NoPermission' };
    } else if ((mask & bit) === 0) {
      return { allowed: false, reason: 'NoPermission' };
    }

    // 4. Separation-of-Duties — only if a target is provided.
    if (target) {
      const sodViolation = await this.checkSeparationOfDuties(
        userId,
        activeRoleIds,
        action,
        target,
      );
      if (sodViolation) {
        return { allowed: false, reason: 'SoDViolation', conflictingAction: sodViolation };
      }
    }

    return { allowed: true };
  }

  /**
   * Walk a role's parent chain merging permission maps.
   *
   * Order: starting role's permissions are written LAST, so they "win" on
   * conflicting bits — but since we OR the bitmasks, the practical effect is
   * union (additive). The "child wins on conflict" rule applies to non-bitmask
   * extras (hiddenFields/readonlyFields) which roles may carry; we expose the
   * raw permission objects via {@link collectHierarchyEntries} for the UI.
   *
   * Cycle-safe: tracks visited role IDs and aborts at depth > MAX_HIERARCHY_DEPTH.
   */
  async collectHierarchyPermissions(
    roleId: string,
    now: Date = new Date(),
  ): Promise<Record<string, number>> {
    const merged: Record<string, number> = {};
    const visited = new Set<string>();

    let cursor: string | null = roleId;
    let depth = 0;
    while (cursor && depth < RbacService.MAX_HIERARCHY_DEPTH) {
      if (visited.has(cursor)) {
        this.logger.warn(`Role hierarchy cycle detected at role=${cursor}`);
        break;
      }
      visited.add(cursor);

      const role = await this.prisma.role.findUnique({ where: { id: cursor } });
      if (!role) break;

      // Skip parents that are temporally invalid — inheritance only flows
      // through currently-active roles.
      const valid =
        (!role.validFrom || now >= role.validFrom) &&
        (!role.validUntil || now <= role.validUntil);

      if (valid) {
        const perms = role.permissions as unknown as Record<string, number> | null;
        if (perms && typeof perms === 'object') {
          for (const [resource, mask] of Object.entries(perms)) {
            merged[resource] = (merged[resource] ?? 0) | Number(mask ?? 0);
          }
        }
      }

      cursor = role.parentRoleId ?? null;
      depth += 1;
    }

    if (depth >= RbacService.MAX_HIERARCHY_DEPTH) {
      this.logger.warn(
        `Role hierarchy depth limit reached starting from role=${roleId}`,
      );
    }

    return merged;
  }

  /**
   * SoD check.
   *
   * For every active role of the user, look up its SoD rules. A rule is a list
   * of conflicting actions ["po.create", "po.approve"]. If `action` matches one
   * of them AND the audit log shows the user has performed any OTHER action
   * from the same list on the same target within the lookback window — DENY.
   *
   * Returns the offending past action, or null if no conflict.
   */
  async checkSeparationOfDuties(
    userId: string,
    activeRoleIds: string[],
    action: PermissionAction,
    target: { entityType: string; entityId: string },
  ): Promise<string | null> {
    if (activeRoleIds.length === 0) return null;

    const rules = await this.prisma.roleSeparationOfDuties.findMany({
      where: { roleId: { in: activeRoleIds } },
    });
    if (rules.length === 0) return null;

    const since = new Date(Date.now() - RbacService.SOD_LOOKBACK_MS);
    const actionStr = String(action);

    for (const rule of rules) {
      const conflicting = this.normalizeActionList(rule.conflictingActions);
      if (!conflicting.includes(actionStr)) continue;

      const others = conflicting.filter((a) => a !== actionStr);
      if (others.length === 0) continue;

      const prior = await this.prisma.auditLog.findFirst({
        where: {
          userId,
          entityType: target.entityType,
          entityId: target.entityId,
          action: { in: others },
          occurredAt: { gte: since },
        },
        orderBy: { occurredAt: 'desc' },
        select: { action: true },
      });

      if (prior) return prior.action;
    }

    return null;
  }

  private normalizeActionList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const v of value) {
      if (typeof v === 'string' && v.length > 0) out.push(v);
    }
    return out;
  }
}

/** Result of an RBAC decision. */
export type RbacDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'NoRolesAssigned' | 'TemporalRoleInvalid' | 'NoPermission' | 'SoDViolation';
      conflictingAction?: string;
    };
