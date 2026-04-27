import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserSession } from '@erp/shared-types';
import { FeatureCacheService } from './feature-cache.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';
import { SKIP_LICENSE_KEY } from './skip-license.decorator';
import { IS_PUBLIC_KEY } from '../../engines/auth/guards/jwt-auth.guard';

/**
 * Statuses that grant entitlement to the system. `expired`, `suspended`,
 * `cancelled`, and `pending` do NOT — those return LICENSE_EXPIRED /
 * LICENSE_REQUIRED.
 */
const ACTIVE_STATUSES = new Set(['active', 'trial', 'grace']);

/**
 * Roles that bypass license enforcement entirely. Super-admins manage
 * tenants and must remain reachable even when a tenant's license lapses
 * (so they can restore it).
 */
const SUPER_ROLES = new Set(['SuperAdmin', 'super_admin']);

/**
 * LicenseGuard — F6 entitlement enforcement (T59).
 *
 * Run AFTER the JWT auth guard so `request.user` is populated. The guard:
 *
 *   1. Bypasses for super-admins.
 *   2. Resolves the company's licensing snapshot via FeatureCacheService.
 *   3. Rejects with `LICENSE_REQUIRED` if no active subscription.
 *   4. Rejects with `LICENSE_EXPIRED` if `validUntil` is in the past.
 *   5. If the route declares `@RequireFeature(code)`, rejects with
 *      `FEATURE_NOT_IN_PLAN` when the code is not in the snapshot.
 *
 * On success, the snapshot is attached to `request.license` for downstream
 * usage (e.g. quota enforcement, audit context).
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  private readonly logger = new Logger(LicenseGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly featureCache: FeatureCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // T66 — opt-out for routes that must remain reachable without a
    // license: auth/health/activation/me-features. Public routes (those
    // marked with @Public()) are also implicitly skipped: a request with
    // no authenticated user belongs to a public route, and license
    // enforcement only makes sense for an identified tenant.
    const skipLicense = this.reflector.getAllAndOverride<boolean>(
      SKIP_LICENSE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipLicense) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & {
      user?: UserSession;
      license?: unknown;
    }>();

    const user = req.user;
    if (!user) {
      // No authenticated user → not our job to authenticate; let the
      // upstream auth guard's rejection stand (or fail-closed here).
      throw new ForbiddenException({
        code: 'LICENSE_REQUIRED',
        messageAr: 'الترخيص مطلوب',
      });
    }

    if (this.isSuperAdmin(user)) return true;

    const companyId = user.companyId;
    if (!companyId) {
      throw new ForbiddenException({
        code: 'LICENSE_REQUIRED',
        messageAr: 'الترخيص مطلوب — لا توجد شركة مرتبطة بالحساب',
      });
    }

    const snapshot = await this.featureCache.get(companyId);
    if (!snapshot) {
      throw new ForbiddenException({
        code: 'LICENSE_REQUIRED',
        messageAr: 'الترخيص مطلوب — لا يوجد اشتراك نشط',
      });
    }

    if (!ACTIVE_STATUSES.has(snapshot.status)) {
      throw new ForbiddenException({
        code: 'LICENSE_EXPIRED',
        messageAr: 'انتهى الترخيص',
        status: snapshot.status,
      });
    }

    if (this.isExpired(snapshot.validUntil, snapshot.graceUntil)) {
      throw new ForbiddenException({
        code: 'LICENSE_EXPIRED',
        messageAr: 'انتهى الترخيص',
        validUntil: snapshot.validUntil,
      });
    }

    const featureCode = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (featureCode && !snapshot.features.includes(featureCode)) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_IN_PLAN',
        messageAr: 'هذه الميزة غير متوفرة في خطتك الحالية',
        feature: featureCode,
        plan: snapshot.planCode,
      });
    }

    // Stash the snapshot for downstream use (quotas, audit).
    req.license = snapshot;
    return true;
  }

  private isSuperAdmin(user: UserSession): boolean {
    return user.roles.some((r) => SUPER_ROLES.has(String(r)));
  }

  /**
   * License is expired if `validUntil` is in the past AND we are also
   * past the grace period (when one is set). Missing `validUntil` is
   * treated as no expiry (e.g. perpetual / pre-paid trial windows that
   * are already filtered by status).
   */
  private isExpired(validUntilIso: string | null, graceUntilIso: string | null): boolean {
    if (!validUntilIso) return false;
    const now = Date.now();
    const validUntil = Date.parse(validUntilIso);
    if (Number.isNaN(validUntil)) return false;
    if (now <= validUntil) return false;

    if (graceUntilIso) {
      const graceUntil = Date.parse(graceUntilIso);
      if (!Number.isNaN(graceUntil) && now <= graceUntil) return false;
    }
    return true;
  }
}
