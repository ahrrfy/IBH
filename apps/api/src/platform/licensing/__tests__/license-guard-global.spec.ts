import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseGuard } from '../license.guard';
import { FeatureCacheService } from '../feature-cache.service';
import { REQUIRE_FEATURE_KEY } from '../require-feature.decorator';
import { SKIP_LICENSE_KEY } from '../skip-license.decorator';
import { IS_PUBLIC_KEY } from '../../../engines/auth/guards/jwt-auth.guard';

/**
 * T66 — verify the global LicenseGuard properly opts out the routes
 * that must remain reachable without an active license:
 *
 *   - `@SkipLicense()`-marked routes (auth, health, activation, me-features)
 *   - `@Public()`-marked routes (no authenticated user expected)
 *
 * And, conversely, that any other authenticated route is BLOCKED when
 * the company has no license snapshot.
 */
function buildContext(opts: {
  user?: unknown;
  skipLicense?: boolean;
  isPublic?: boolean;
  featureCode?: string;
}): ExecutionContext {
  const request: { user: unknown; license?: unknown } = { user: opts.user };
  const handler = () => undefined;
  const cls = class StubController {};

  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === SKIP_LICENSE_KEY) return opts.skipLicense ?? false;
    if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
    if (key === REQUIRE_FEATURE_KEY) return opts.featureCode;
    return undefined;
  });

  // Attach reflector for the guard constructor in tests below.
  (request as unknown as { __reflector: Reflector }).__reflector = reflector;

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

function makeGuard(reflector: Reflector, cache: Partial<FeatureCacheService> = {}): LicenseGuard {
  return new LicenseGuard(reflector, cache as FeatureCacheService);
}

describe('LicenseGuard — global enforcement (T66)', () => {
  it('skips the guard entirely for @SkipLicense() routes', async () => {
    const ctx = buildContext({ skipLicense: true, user: undefined });
    const reflector = (ctx.switchToHttp().getRequest() as { __reflector: Reflector }).__reflector;
    const cacheGet = jest.fn();
    const guard = makeGuard(reflector, { get: cacheGet, invalidate: jest.fn() } as Partial<FeatureCacheService>);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it('skips the guard for @Public() routes (no authenticated user)', async () => {
    const ctx = buildContext({ isPublic: true, user: undefined });
    const reflector = (ctx.switchToHttp().getRequest() as { __reflector: Reflector }).__reflector;
    const cacheGet = jest.fn();
    const guard = makeGuard(reflector, { get: cacheGet, invalidate: jest.fn() } as Partial<FeatureCacheService>);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it('blocks an authenticated route when the company has no license snapshot', async () => {
    const ctx = buildContext({
      user: { userId: 'U1', companyId: 'CMP-NO-LICENSE', roles: ['Manager'] },
    });
    const reflector = (ctx.switchToHttp().getRequest() as { __reflector: Reflector }).__reflector;
    const cacheGet = jest.fn().mockResolvedValue(null);
    const guard = makeGuard(reflector, { get: cacheGet, invalidate: jest.fn() } as Partial<FeatureCacheService>);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { code: 'LICENSE_REQUIRED' },
    });
    expect(cacheGet).toHaveBeenCalledWith('CMP-NO-LICENSE');
  });

  it('still bypasses for SuperAdmin even when no snapshot exists', async () => {
    const ctx = buildContext({
      user: { userId: 'U1', companyId: 'CMP1', roles: ['SuperAdmin'] },
    });
    const reflector = (ctx.switchToHttp().getRequest() as { __reflector: Reflector }).__reflector;
    const cacheGet = jest.fn();
    const guard = makeGuard(reflector, { get: cacheGet, invalidate: jest.fn() } as Partial<FeatureCacheService>);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(cacheGet).not.toHaveBeenCalled();
  });
});
