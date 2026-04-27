import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import type { UserSession } from '@erp/shared-types';
import { FeatureCacheService } from './feature-cache.service';

/**
 * T65 — Web-side feature flag mirror.
 *
 * Returns the active licensing snapshot for the *current user's company*
 * so the web shell can hide/disable UI elements per plan in real time.
 *
 * Auth: requires a valid session (JWT). No extra permission is needed —
 * a user can always see their own company's enabled features (this is
 * how the UI knows what it is allowed to render). Hard enforcement is
 * still owned by `LicenseGuard` (T59) on each protected endpoint.
 *
 * Real-time bidirectional flow:
 *   1. Admin upgrades/downgrades plan via T63
 *   2. Subscription service calls FeatureCacheService.invalidate(companyId)
 *   3. invalidate() drops Redis key + emits `license.plan.changed`
 *   4. EventRelayService routes to room `company:<companyId>`
 *   5. Web hook (useFeature) listens, invalidates the cached query,
 *      refetches this endpoint → UI re-renders without F5.
 */
@Controller('licensing/me')
export class MeFeaturesController {
  constructor(private readonly featureCache: FeatureCacheService) {}

  /**
   * GET /api/v1/licensing/me/features
   *
   * Response shape (always 200 for an authenticated user):
   *   - features:   string[] of enabled feature codes (sorted, deduped)
   *   - planCode:   plan identifier (e.g. 'starter', 'professional', 'enterprise')
   *                 or null when the company has no active subscription
   *   - planId:     ULID of the plan, or null
   *   - status:     subscription status (active|trial|grace|...) or null
   *   - validUntil: ISO timestamp the subscription remains valid until, or null
   *   - graceUntil: ISO timestamp the grace period ends, or null
   */
  @Get('features')
  async myFeatures(@CurrentUser() user: UserSession): Promise<{
    features: string[];
    planCode: string | null;
    planId: string | null;
    status: string | null;
    validUntil: string | null;
    graceUntil: string | null;
  }> {
    if (!user?.companyId) {
      throw new UnauthorizedException('NO_COMPANY_CONTEXT');
    }

    const snap = await this.featureCache.get(user.companyId);
    if (!snap) {
      return {
        features: [],
        planCode: null,
        planId: null,
        status: null,
        validUntil: null,
        graceUntil: null,
      };
    }

    return {
      features: snap.features,
      planCode: snap.planCode,
      planId: snap.planId,
      status: snap.status,
      validUntil: snap.validUntil,
      graceUntil: snap.graceUntil,
    };
  }
}
