import { Global, Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { LicenseGuard } from './license.guard';
import { LicenseSignerService } from './license-signer.service';
import { PlanChangeService } from './plan-change.service';
import { LicenseActivationController } from './activation.controller';
import { LicensingMirrorModule } from './licensing-mirror.module';
import { LicensingModule } from '../../modules/licensing/licensing.module';

/**
 * Platform-level licensing module (T59).
 *
 * Distinct from the business-level `modules/licensing` (which owns the
 * legacy License model and admin endpoints). This module provides the
 * runtime entitlement primitives — guard, decorator metadata key, and
 * the Redis-cached feature lookup — that any other module can import or
 * inject without pulling in the business module's controllers.
 *
 * Marked `@Global()` so callers can `@UseGuards(LicenseGuard)` without
 * re-importing this module everywhere. RedisModule and RealtimeModule
 * are themselves global, so the cache and event emit work out-of-the-box.
 */
@Global()
@Module({
  imports: [PrismaModule, LicensingMirrorModule, forwardRef(() => LicensingModule)],
  controllers: [LicenseActivationController],
  providers: [
    LicenseGuard,
    LicenseSignerService,
    PlanChangeService,
  ],
  exports: [LicenseGuard, LicenseSignerService, PlanChangeService],
})
export class PlatformLicensingModule {}

/**
 * 5.D split — APP_GUARD registration is the *only* thing that 403s every
 * route on a greenfield install (no Subscription seeded). Extracted into
 * its own module so {@link PlatformLicensingModule} can stay loaded
 * unconditionally — its read services (PlanChangeService etc.) are needed
 * by AdminLicensingModule + AutopilotModule even when the global guard is
 * intentionally off. Gated by LICENSE_GUARD_DISABLED in app.module.ts.
 */
@Module({
  imports: [PlatformLicensingModule],
  providers: [
    // T66 — register the LicenseGuard as a GLOBAL APP_GUARD so license
    // enforcement is on by default for every authenticated route. The
    // guard internally honors `@SkipLicense()` and `@Public()` so auth,
    // health, license activation/renewal, and the me-features mirror
    // remain reachable when a tenant has no active license.
    { provide: APP_GUARD, useExisting: LicenseGuard },
  ],
})
export class LicenseGuardEnforcementModule {}
