import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureCacheService } from './feature-cache.service';
import { MeFeaturesController } from './me-features.controller';

/**
 * I052 — Always-on licensing mirror.
 *
 * The full `PlatformLicensingModule` (which registers a global LicenseGuard)
 * sits behind `BACKGROUND_JOBS_DISABLED=1` because greenfield installs have
 * no Subscription rows yet, so the guard would 403 every authenticated
 * request. But the web shell still calls `GET /licensing/me/features` on
 * boot to know which features to show — when that route 404s, the UI can't
 * tell "no plan" from "endpoint missing" and falls back to a broken state.
 *
 * This module exposes only the read-only mirror endpoint and the cache
 * service it depends on. No global guard, no signing, no plan-change
 * machinery. Safe to load unconditionally at app boot.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [MeFeaturesController],
  providers: [FeatureCacheService],
  exports: [FeatureCacheService],
})
export class LicensingMirrorModule {}
