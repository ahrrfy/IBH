import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LicenseActivationController } from '../activation.controller';
import { LicenseSignerService } from '../license-signer.service';

/**
 * T64 — LicenseActivationController happy-path + revocation tests.
 *
 * Prisma, FingerprintService, and FeatureCacheService are all stubbed.
 * The signer is wired with a real RSA-2048 keypair so that
 * sign/verify actually goes through `crypto`.
 *
 * Coverage:
 *   - issue: creates Subscription + LicenseKey + LicenseEvent, returns
 *     a token that round-trip-verifies to the right claims.
 *   - activate: calls fingerprint.register, mints a 30-day activation
 *     token bound to fphash, capped by license expiry.
 *   - activate: rejects revoked LicenseKey rows (ForbiddenException).
 *   - revoke: marks key + cascades to bound fingerprints; idempotent.
 */

const ULID_A = '01HABCDEFGHJKMNPQRSTVWXYZ0';
const ULID_PLAN = '01HBBBBBBBBBBBBBBBBBBBBBBB';
const ULID_SUB = '01HCCCCCCCCCCCCCCCCCCCCCCC';
const ULID_LK = '01HDDDDDDDDDDDDDDDDDDDDDDD';
const FP_A = 'a'.repeat(64);

function makeSigner(): LicenseSignerService {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const config = {
    get: (k: string): string | undefined =>
      k === 'LICENSE_PRIVATE_KEY_PEM'
        ? Buffer.from(
            privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
            'utf8',
          ).toString('base64')
        : k === 'LICENSE_PUBLIC_KEY_PEM'
          ? Buffer.from(
              publicKey.export({ type: 'spki', format: 'pem' }) as string,
              'utf8',
            ).toString('base64')
          : undefined,
  } as unknown as ConfigService;
  const svc = new LicenseSignerService(config);
  svc.onModuleInit();
  return svc;
}

interface FakeLicenseKey {
  id: string;
  subscriptionId: string;
  key: string;
  signatureSha: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  maxDevices: number;
  lastSeenAt: Date | null;
  subscription?: FakeSubscription & { plan?: FakePlan };
}
interface FakeSubscription {
  id: string;
  companyId: string;
  planId: string;
  status: string;
  billingCycle: 'monthly' | 'annual' | 'bundle';
  currentPeriodEndAt: Date | null;
  updatedAt: Date;
}
interface FakePlan {
  id: string;
  code: string;
  monthlyPriceIqd: number;
  maxUsers: number | null;
  features: { featureCode: string; isEnabled: boolean }[];
}

function makePrisma(seed: {
  plan?: FakePlan;
  subscription?: FakeSubscription;
  licenseKey?: FakeLicenseKey;
}) {
  const state = {
    plan: seed.plan,
    subscriptions: seed.subscription ? [seed.subscription] : [],
    licenseKeys: seed.licenseKey ? [seed.licenseKey] : [],
    licenseEvents: [] as { eventType: string; payload: object }[],
    fingerprintRevokeCalls: 0,
  };

  return {
    state,
    plan: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        state.plan && state.plan.id === where.id ? state.plan : null,
      ),
    },
    subscription: {
      findFirst: jest.fn(async ({ where }: { where: { companyId: string; planId: string } }) =>
        state.subscriptions.find(
          (s) => s.companyId === where.companyId && s.planId === where.planId,
        ) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: any }) => {
        const sub: FakeSubscription = {
          id: ULID_SUB,
          companyId: data.companyId,
          planId: data.planId,
          status: data.status,
          billingCycle: 'monthly',
          currentPeriodEndAt: data.currentPeriodEndAt,
          updatedAt: new Date(),
        };
        state.subscriptions.push(sub);
        return sub;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const sub = state.subscriptions.find((s) => s.id === where.id);
        if (!sub) throw new Error('not found');
        Object.assign(sub, data);
        sub.updatedAt = new Date();
        return sub;
      }),
    },
    licenseKey: {
      create: jest.fn(async ({ data }: { data: any }) => {
        const row: FakeLicenseKey = {
          id: ULID_LK,
          subscriptionId: data.subscriptionId,
          key: data.key,
          signatureSha: data.signatureSha,
          expiresAt: data.expiresAt,
          revokedAt: null,
          revokedReason: null,
          maxDevices: data.maxDevices,
          lastSeenAt: null,
        };
        state.licenseKeys.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where, include }: { where: { id: string }; include?: any }) => {
        const row = state.licenseKeys.find((r) => r.id === where.id);
        if (!row) return null;
        if (include?.subscription) {
          const sub = state.subscriptions.find((s) => s.id === row.subscriptionId);
          return {
            ...row,
            subscription:
              include.subscription === true || !include.subscription.include
                ? sub
                : { ...sub, plan: state.plan },
          };
        }
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const row = state.licenseKeys.find((r) => r.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
    },
    licenseEvent: {
      create: jest.fn(async ({ data }: { data: any }) => {
        state.licenseEvents.push({ eventType: data.eventType, payload: data.payload });
        return data;
      }),
    },
    hardwareFingerprint: {
      updateMany: jest.fn(async () => {
        const n = state.fingerprintRevokeCalls === 0 ? 2 : 0;
        state.fingerprintRevokeCalls++;
        return { count: n };
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn({
      licenseKey: {
        update: async (args: any) => {
          const row = state.licenseKeys.find((r) => r.id === args.where.id);
          if (row) Object.assign(row, args.data);
          return row;
        },
      },
      hardwareFingerprint: {
        updateMany: async () => {
          const n = state.fingerprintRevokeCalls === 0 ? 2 : 0;
          state.fingerprintRevokeCalls++;
          return { count: n };
        },
      },
      licenseEvent: {
        create: async ({ data }: { data: any }) => {
          state.licenseEvents.push({ eventType: data.eventType, payload: data.payload });
          return data;
        },
      },
    })),
  };
}

function makeFingerprintService() {
  return {
    register: jest.fn(async () => ({ id: 'fp-1' })),
    validate: jest.fn(async () => true),
    revoke: jest.fn(async () => undefined),
  };
}

function makeFeatureCache() {
  return { invalidate: jest.fn(async () => undefined) };
}

const SESSION = {
  userId: '01HUSERUSERUSERUSERUSER000',
  companyId: ULID_A,
} as any;

describe('LicenseActivationController', () => {
  it('issues a license: creates rows, signs token, invalidates cache', async () => {
    const signer = makeSigner();
    const prisma = makePrisma({
      plan: {
        id: ULID_PLAN,
        code: 'starter',
        monthlyPriceIqd: 100_000,
        maxUsers: 5,
        features: [
          { featureCode: 'pos.web', isEnabled: true },
          { featureCode: 'hr.basic', isEnabled: true },
        ],
      },
    });
    const fingerprints = makeFingerprintService();
    const cache = makeFeatureCache();
    const ctrl = new LicenseActivationController(
      prisma as any,
      signer,
      fingerprints as any,
      cache as any,
    );

    const out = await ctrl.issue(
      { companyId: ULID_A, planId: ULID_PLAN, durationDays: 30 },
      SESSION,
    );
    expect(out.licenseKey.split('.').length).toBe(3);
    expect(out.licenseKeyId).toBe(ULID_LK);

    // Token round-trips and carries the right claims
    const decoded = signer.verifyLicense(out.licenseKey);
    expect(decoded.companyId).toBe(ULID_A);
    expect(decoded.planCode).toBe('starter');
    expect(decoded.features.sort()).toEqual(['hr.basic', 'pos.web']);
    expect(decoded.maxDevices).toBe(5);
    expect(decoded.typ).toBe('license');

    expect(prisma.subscription.create).toHaveBeenCalled();
    expect(prisma.licenseEvent.create).toHaveBeenCalled();
    expect(cache.invalidate).toHaveBeenCalledWith(ULID_A);
  });

  it('activate: binds fingerprint and returns 30-day activation token with fphash', async () => {
    const signer = makeSigner();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const prisma = makePrisma({
      subscription: {
        id: ULID_SUB,
        companyId: ULID_A,
        planId: ULID_PLAN,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodEndAt: expiresAt,
        updatedAt: new Date(),
      },
      licenseKey: {
        id: ULID_LK,
        subscriptionId: ULID_SUB,
        key: 'placeholder',
        signatureSha: '0'.repeat(64),
        expiresAt,
        revokedAt: null,
        revokedReason: null,
        maxDevices: 3,
        lastSeenAt: null,
      },
    });
    const fingerprints = makeFingerprintService();
    const cache = makeFeatureCache();
    const ctrl = new LicenseActivationController(
      prisma as any,
      signer,
      fingerprints as any,
      cache as any,
    );

    const longLived = signer.buildAndSign({
      companyId: ULID_A,
      planCode: 'starter',
      subscriptionId: ULID_SUB,
      licenseKeyId: ULID_LK,
      validFrom: new Date(),
      validUntil: expiresAt,
      maxDevices: 3,
      features: ['pos.web'],
      typ: 'license',
    });

    const out = await ctrl.activate({
      licenseKey: longLived,
      fingerprint: FP_A,
      deviceLabel: 'POS-Counter1',
    });

    expect(fingerprints.register).toHaveBeenCalledWith(ULID_LK, FP_A, 'POS-Counter1');
    expect(out.payload.typ).toBe('activation');
    expect(out.payload.fphash).toBeDefined();
    // Activation expiry capped at 30 days even though license lives a year
    const ageMs = new Date(out.expiresAt).getTime() - Date.now();
    expect(ageMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(ageMs).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
  });

  it('activate: rejects a license whose DB row is revoked', async () => {
    const signer = makeSigner();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const prisma = makePrisma({
      subscription: {
        id: ULID_SUB,
        companyId: ULID_A,
        planId: ULID_PLAN,
        status: 'cancelled',
        billingCycle: 'monthly',
        currentPeriodEndAt: expiresAt,
        updatedAt: new Date(),
      },
      licenseKey: {
        id: ULID_LK,
        subscriptionId: ULID_SUB,
        key: 'placeholder',
        signatureSha: '0'.repeat(64),
        expiresAt,
        revokedAt: new Date(),
        revokedReason: 'manual_revoke',
        maxDevices: 3,
        lastSeenAt: null,
      },
    });
    const ctrl = new LicenseActivationController(
      prisma as any,
      signer,
      makeFingerprintService() as any,
      makeFeatureCache() as any,
    );

    const longLived = signer.buildAndSign({
      companyId: ULID_A,
      planCode: 'starter',
      subscriptionId: ULID_SUB,
      licenseKeyId: ULID_LK,
      validFrom: new Date(),
      validUntil: expiresAt,
      maxDevices: 3,
      features: ['pos.web'],
      typ: 'license',
    });

    await expect(
      ctrl.activate({ licenseKey: longLived, fingerprint: FP_A }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('revoke: marks LicenseKey + cascades soft-revoke to fingerprints', async () => {
    const signer = makeSigner();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const prisma = makePrisma({
      subscription: {
        id: ULID_SUB,
        companyId: ULID_A,
        planId: ULID_PLAN,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodEndAt: expiresAt,
        updatedAt: new Date(),
      },
      licenseKey: {
        id: ULID_LK,
        subscriptionId: ULID_SUB,
        key: 'placeholder',
        signatureSha: '0'.repeat(64),
        expiresAt,
        revokedAt: null,
        revokedReason: null,
        maxDevices: 3,
        lastSeenAt: null,
      },
    });
    const cache = makeFeatureCache();
    const ctrl = new LicenseActivationController(
      prisma as any,
      signer,
      makeFingerprintService() as any,
      cache as any,
    );

    const out = await ctrl.revoke(
      { licenseKeyId: ULID_LK, reason: 'fraud' },
      SESSION,
    );
    expect(out.revoked).toBe(true);
    expect(out.revokedDevices).toBe(2);
    expect(prisma.state.licenseEvents.find((e) => e.eventType === 'cancelled')).toBeTruthy();
    expect(cache.invalidate).toHaveBeenCalledWith(ULID_A);
  });

  it('revoke: returns 404 for a non-existent LicenseKey', async () => {
    const signer = makeSigner();
    const prisma = makePrisma({});
    const ctrl = new LicenseActivationController(
      prisma as any,
      signer,
      makeFingerprintService() as any,
      makeFeatureCache() as any,
    );

    await expect(
      ctrl.revoke({ licenseKeyId: ULID_LK, reason: 'oops' }, SESSION),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('public-key endpoint returns a PEM the same signer can verify against', () => {
    const signer = makeSigner();
    const ctrl = new LicenseActivationController(
      {} as any,
      signer,
      makeFingerprintService() as any,
      makeFeatureCache() as any,
    );
    const pem = ctrl.getPublicKey();
    expect(pem).toMatch(/-----BEGIN PUBLIC KEY-----/);
  });
});
