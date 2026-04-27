import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseGuard } from '../license.guard';
import { FeatureCacheService, CompanyLicenseSnapshot } from '../feature-cache.service';
import { REQUIRE_FEATURE_KEY } from '../require-feature.decorator';

/**
 * Build a minimal ExecutionContext stub with a fake request.user and a
 * controllable per-route feature requirement.
 */
function buildContext(user: unknown, featureCode?: string): {
  context: ExecutionContext;
  request: { user: unknown; license?: unknown };
  reflector: Reflector;
} {
  const request: { user: unknown; license?: unknown } = { user };

  const handler = () => undefined;
  const cls = class StubController {};

  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key) =>
      key === REQUIRE_FEATURE_KEY ? featureCode : undefined,
    );

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;

  return { context, request, reflector };
}

function snapshotWith(overrides: Partial<CompanyLicenseSnapshot> = {}): CompanyLicenseSnapshot {
  return {
    companyId: 'CMP1',
    subscriptionId: 'SUB1',
    planId: 'PLN1',
    planCode: 'business',
    status: 'active',
    validUntil: new Date(Date.now() + 86_400_000).toISOString(), // +1 day
    graceUntil: null,
    features: ['sales.basic', 'crm.advanced'],
    ...overrides,
  };
}

describe('LicenseGuard', () => {
  let cache: jest.Mocked<Pick<FeatureCacheService, 'get' | 'invalidate'>>;

  beforeEach(() => {
    cache = {
      get: jest.fn(),
      invalidate: jest.fn(),
    };
  });

  /**
   * Happy path: an active subscription with a future expiry and the
   * required feature in the plan should pass.
   */
  it('allows access with an active license and the required feature', async () => {
    cache.get.mockResolvedValue(snapshotWith());
    const user = { userId: 'U1', companyId: 'CMP1', roles: ['Cashier'] };
    const { context, request, reflector } = buildContext(user, 'crm.advanced');
    const guard = new LicenseGuard(reflector, cache as unknown as FeatureCacheService);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.license).toBeDefined();
  });

  /**
   * Super-admin role bypasses license checks entirely so they can
   * recover lapsed tenants.
   */
  it('bypasses checks for SuperAdmin role', async () => {
    const user = { userId: 'U1', companyId: 'CMP1', roles: ['SuperAdmin'] };
    const { context, reflector } = buildContext(user);
    const guard = new LicenseGuard(reflector, cache as unknown as FeatureCacheService);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(cache.get).not.toHaveBeenCalled();
  });

  /**
   * No subscription on file → LICENSE_REQUIRED.
   */
  it('rejects with LICENSE_REQUIRED when no subscription exists', async () => {
    cache.get.mockResolvedValue(null);
    const user = { userId: 'U1', companyId: 'CMP1', roles: ['Cashier'] };
    const { context, reflector } = buildContext(user);
    const guard = new LicenseGuard(reflector, cache as unknown as FeatureCacheService);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LICENSE_REQUIRED' }),
    });
  });

  /**
   * Subscription past validUntil with no grace → LICENSE_EXPIRED.
   */
  it('rejects with LICENSE_EXPIRED when validUntil is in the past', async () => {
    cache.get.mockResolvedValue(
      snapshotWith({
        validUntil: new Date(Date.now() - 86_400_000).toISOString(),
        graceUntil: null,
      }),
    );
    const user = { userId: 'U1', companyId: 'CMP1', roles: ['Cashier'] };
    const { context, reflector } = buildContext(user);
    const guard = new LicenseGuard(reflector, cache as unknown as FeatureCacheService);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LICENSE_EXPIRED' }),
    });
  });

  /**
   * Within grace period: still allowed even though validUntil has passed.
   */
  it('allows access while within the grace period', async () => {
    cache.get.mockResolvedValue(
      snapshotWith({
        status: 'grace',
        validUntil: new Date(Date.now() - 86_400_000).toISOString(),
        graceUntil: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );
    const user = { userId: 'U1', companyId: 'CMP1', roles: ['Cashier'] };
    const { context, reflector } = buildContext(user);
    const guard = new LicenseGuard(reflector, cache as unknown as FeatureCacheService);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  /**
   * Plan does not include requested feature → FEATURE_NOT_IN_PLAN.
   */
  it('rejects with FEATURE_NOT_IN_PLAN when the plan lacks the feature', async () => {
    cache.get.mockResolvedValue(
      snapshotWith({ features: ['sales.basic'] }),
    );
    const user = { userId: 'U1', companyId: 'CMP1', roles: ['Cashier'] };
    const { context, reflector } = buildContext(user, 'crm.advanced');
    const guard = new LicenseGuard(reflector, cache as unknown as FeatureCacheService);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FEATURE_NOT_IN_PLAN',
        feature: 'crm.advanced',
      }),
    });
  });

  /**
   * Suspended/cancelled status → LICENSE_EXPIRED even before checking
   * the validUntil date.
   */
  it('rejects with LICENSE_EXPIRED for a suspended subscription', async () => {
    cache.get.mockResolvedValue(snapshotWith({ status: 'suspended' }));
    const user = { userId: 'U1', companyId: 'CMP1', roles: ['Cashier'] };
    const { context, reflector } = buildContext(user);
    const guard = new LicenseGuard(reflector, cache as unknown as FeatureCacheService);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LICENSE_EXPIRED' }),
    });
  });
});

describe('FeatureCacheService.invalidate', () => {
  /**
   * Invalidation must (a) delete the Redis key and (b) emit a realtime
   * event so connected sessions refresh without restart (T31 bidirectional).
   */
  it('deletes the cache key and emits license.plan.changed', async () => {
    const del = jest.fn().mockResolvedValue(1);
    const emit = jest.fn().mockReturnValue(true);

    const redis = { del, get: jest.fn(), set: jest.fn() } as unknown as import('ioredis').default;
    const events = { emit } as unknown as import('@nestjs/event-emitter').EventEmitter2;
    const prisma = {} as never;

    // Use require to avoid ESM/CJS import cycle in the test runtime.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FeatureCacheService } = require('../feature-cache.service');
    const svc = new FeatureCacheService(prisma, redis, events);

    await svc.invalidate('CMP-XYZ');

    expect(del).toHaveBeenCalledWith('license:features:CMP-XYZ');
    expect(emit).toHaveBeenCalledWith(
      'license.plan.changed',
      expect.objectContaining({ companyId: 'CMP-XYZ', __event: 'license.plan.changed' }),
    );
  });
});
