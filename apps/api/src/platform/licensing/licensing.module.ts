import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LicenseGuard } from './license.guard';
import { FeatureCacheService } from './feature-cache.service';

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
  imports: [PrismaModule],
  providers: [FeatureCacheService, LicenseGuard],
  exports: [FeatureCacheService, LicenseGuard],
})
export class PlatformLicensingModule {}
