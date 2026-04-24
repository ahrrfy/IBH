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

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

export interface RequiredPermission {
  resource: string;
  action: PermissionAction;
}

/**
 * Session permission cache — not part of UserSession public shape.
 * Stored on a symbol-keyed extension to avoid type coupling.
 */
const PERM_CACHE = Symbol.for('erp.session.permCache');

interface CachedPerms {
  superAdmin: boolean;
  byResource: Record<string, number>;
}

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

    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ user?: UserSession }>();
    const session = request.user as any;

    if (!session) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        messageAr: 'غير مصرح لك بهذا الإجراء',
      });
    }

    let cache: CachedPerms | undefined = session[PERM_CACHE];
    if (!cache) {
      cache = await this.loadCache(session.userId);
      session[PERM_CACHE] = cache;
    }

    if (cache.superAdmin) return true;

    const bit = PERMISSION_BIT[required.action as string];
    if (!bit) {
      // Unknown action — require explicit role entry naming the resource
      const mask = cache.byResource[required.resource] ?? 0;
      if (mask === 0) {
        this.deny(session, required);
      }
      return true;
    }

    const mask = cache.byResource[required.resource] ?? 0;
    if ((mask & bit) === 0) this.deny(session, required);
    return true;
  }

  private deny(session: UserSession, required: RequiredPermission): never {
    this.logger.warn(
      `Access denied: user=${session.userId} resource=${required.resource} action=${required.action}`,
    );
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      messageAr: `ليس لديك صلاحية على ${required.resource}`,
    });
  }

  private async loadCache(userId: string): Promise<CachedPerms> {
    try {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        include: { role: true },
      });

      if (userRoles.some((ur: any) => ur.role?.name === 'super_admin' || ur.role?.name === 'SuperAdmin')) {
        return { superAdmin: true, byResource: {} };
      }

      const byResource: Record<string, number> = {};
      for (const ur of userRoles) {
        const perms = (ur as any).role?.permissions as Record<string, number> | null;
        if (!perms) continue;
        for (const [resource, bitmask] of Object.entries(perms)) {
          byResource[resource] = (byResource[resource] ?? 0) | Number(bitmask);
        }
      }
      return { superAdmin: false, byResource };
    } catch (err) {
      this.logger.error('Failed to load permissions:', err);
      return { superAdmin: false, byResource: {} };
    }
  }
}
