import { UnauthorizedException } from '@nestjs/common';
import { MeFeaturesController } from '../me-features.controller';
import type { FeatureCacheService, CompanyLicenseSnapshot } from '../feature-cache.service';
import type { UserSession } from '@erp/shared-types';

/**
 * T65 — Unit-level test for the per-user feature endpoint.
 *
 * Covers the three branches that matter for the web client:
 *   1. No companyId on the session → 401 (session is not tenant-scoped).
 *   2. Company has no active subscription → empty list, all-null fields.
 *   3. Company has an active subscription → features + plan info pass through.
 */
describe('MeFeaturesController', () => {
  let cache: jest.Mocked<Pick<FeatureCacheService, 'get'>>;
  let controller: MeFeaturesController;

  const userWithCompany = {
    userId: 'USR1',
    companyId: 'CMP1',
    tenantId: 'CMP1',
    branchId: null,
    roles: ['user'],
    email: 'a@b.c',
  } as unknown as UserSession;

  beforeEach(() => {
    cache = { get: jest.fn() };
    controller = new MeFeaturesController(cache as unknown as FeatureCacheService);
  });

  it('throws Unauthorized when the session has no companyId (defensive)', async () => {
    const session = { userId: 'USR1', companyId: null } as unknown as UserSession;
    await expect(controller.myFeatures(session)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('returns an empty entitlement set when the cache reports no license', async () => {
    cache.get.mockResolvedValue(null);
    const res = await controller.myFeatures(userWithCompany);
    expect(res).toEqual({
      features: [],
      planCode: null,
      planId: null,
      status: null,
      validUntil: null,
      graceUntil: null,
    });
    expect(cache.get).toHaveBeenCalledWith('CMP1');
  });

  it('returns features + plan info from the cache snapshot', async () => {
    const snap: CompanyLicenseSnapshot = {
      companyId: 'CMP1',
      subscriptionId: 'SUB1',
      planId: 'PLN_PRO',
      planCode: 'professional',
      status: 'active',
      validUntil: '2099-01-01T00:00:00.000Z',
      graceUntil: null,
      features: ['hr.core', 'manufacturing', 'ai.tier3'],
    };
    cache.get.mockResolvedValue(snap);

    const res = await controller.myFeatures(userWithCompany);

    expect(res.features).toEqual(['hr.core', 'manufacturing', 'ai.tier3']);
    expect(res.planCode).toBe('professional');
    expect(res.planId).toBe('PLN_PRO');
    expect(res.status).toBe('active');
    expect(res.validUntil).toBe('2099-01-01T00:00:00.000Z');
    expect(res.graceUntil).toBeNull();
  });
});
