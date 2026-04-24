import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserSession } from '@erp/shared-types';
import { PERMISSION_BIT } from '@erp/shared-types';
import type { PermissionAction } from '@erp/shared-types';
import { PrismaService } from '../../../platform/prisma/prisma.service';

// ─── Metadata Keys ────────────────────────────────────────────────────────────

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

export interface RequiredPermission {
  resource: string; // e.g. 'Invoice', 'Product', 'User'
  action: PermissionAction;
}

// ─── RBAC Guard ───────────────────────────────────────────────────────────────
// Checks that request.user has the required permission for the resource.
// Permissions are loaded from DB once per request (cached in UserSession).
// Uses bitmask evaluation: role.permissions[resource] & PERMISSION_BIT[action]

@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new Logger(RbacGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission required on this route → allow
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ user?: UserSession }>();
    const session = request.user;

    if (!session) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        messageAr: 'غير مصرح لك بهذا الإجراء',
      });
    }

    // Populate permissions if empty (first guard call in request lifecycle)
    if (session.permissions.length === 0) {
      await this.populatePermissions(session);
    }

    const hasPermission = this.checkPermission(session, required.resource, required.action);

    if (!hasPermission) {
      this.logger.warn(
        `Access denied: user=${session.userId} resource=${required.resource} action=${required.action}`,
      );
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        messageAr: `ليس لديك صلاحية ${this.actionAr(required.action)} على ${required.resource}`,
      });
    }

    return true;
  }

  // ─── Permission Resolution ─────────────────────────────────────────────────

  /**
   * Load permissions from DB roles and populate session.permissions.
   * SuperAdmin gets all permissions automatically.
   */
  private async populatePermissions(session: UserSession): Promise<void> {
    try {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId: session.userId, isActive: true },
        include: { role: true },
      });

      if (userRoles.some(ur => ur.role.name === 'super_admin')) {
        // SuperAdmin has every permission — marker entry
        session.permissions = [{ resource: '*', action: '*' as PermissionAction, bitmask: 0xFFFF }];
        return;
      }

      // Merge permission bitmasks across all roles
      const merged: Record<string, number> = {};

      for (const ur of userRoles) {
        const perms = ur.role.permissions as Record<string, number> | null;
        if (!perms) continue;

        for (const [resource, bitmask] of Object.entries(perms)) {
          merged[resource] = (merged[resource] ?? 0) | bitmask;
        }
      }

      session.permissions = Object.entries(merged).map(([resource, bitmask]) => ({
        resource,
        action: 'read' as PermissionAction, // placeholder — real check uses bitmask
        bitmask,
      }));
    } catch (err) {
      this.logger.error('Failed to load permissions:', err);
      session.permissions = [];
    }
  }

  /**
   * Check if session has permission for resource + action using bitmask.
   */
  private checkPermission(
    session: UserSession,
    resource: string,
    action: PermissionAction,
  ): boolean {
    // SuperAdmin bypass
    const superAdmin = session.permissions.find(p => p.resource === '*');
    if (superAdmin) return true;

    const bit = PERMISSION_BIT[action];
    if (bit === undefined) return false;

    const entry = session.permissions.find(p => p.resource === resource);
    if (!entry) return false;

    return (entry.bitmask & bit) !== 0;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private actionAr(action: PermissionAction): string {
    const map: Record<PermissionAction, string> = {
      create: 'إنشاء',
      read: 'عرض',
      update: 'تعديل',
      delete: 'حذف',
      submit: 'تقديم',
      approve: 'اعتماد',
      print: 'طباعة',
    };
    return map[action] ?? action;
  }
}
