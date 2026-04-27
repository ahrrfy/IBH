import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key under which the required feature code is stored on the
 * route handler / controller class. The LicenseGuard reads this key via
 * Reflector to decide whether the active subscription's plan grants
 * access to the feature.
 */
export const REQUIRE_FEATURE_KEY = 'license:require-feature';

/**
 * `@RequireFeature('module.code')` — gate any controller or route by a
 * licensed feature code.
 *
 * Usage:
 *
 * ```ts
 *   @UseGuards(JwtAuthGuard, LicenseGuard)
 *   @RequireFeature('crm.advanced')
 *   @Get()
 *   findAll() { ... }
 * ```
 *
 * If the active company's plan (or per-subscription override) does not
 * include the named feature, the LicenseGuard responds with HTTP 403 and
 * the error code `FEATURE_NOT_IN_PLAN`. SuperAdmin always bypasses.
 *
 * @param featureCode — canonical feature identifier (matches `PlanFeature.featureCode`).
 */
export const RequireFeature = (featureCode: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_FEATURE_KEY, featureCode);
