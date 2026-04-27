import { FingerprintService } from '../fingerprint.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Unit tests for T62 — Hardware Fingerprint Binding Service.
 *
 * Prisma is stubbed with an in-memory store keyed by (licenseKeyId, hash).
 * No DB. Covers register / duplicate / max-exceeded / revoke / validate
 * paths plus input-format guards.
 */

const VALID_HASH_A =
  'a'.repeat(64);
const VALID_HASH_B =
  'b'.repeat(64);
const VALID_HASH_C =
  'c'.repeat(64);

interface FakeKey {
  id: string;
  maxDevices: number;
  revokedAt: Date | null;
}

interface FakeFp {
  id: string;
  licenseKeyId: string;
  fingerprintHash: string;
  deviceLabel: string | null;
  isActive: boolean;
  revokedAt: Date | null;
  revokedReason: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

function makePrisma(keys: FakeKey[], initialFps: FakeFp[] = []) {
  const fps: FakeFp[] = [...initialFps];
  let nextId = 1;
  return {
    licenseKey: {
      findUnique: async ({ where }: any) =>
        keys.find((k) => k.id === where.id) ?? null,
    },
    hardwareFingerprint: {
      findUnique: async ({ where }: any) => {
        const k = where.licenseKeyId_fingerprintHash;
        return (
          fps.find(
            (f) =>
              f.licenseKeyId === k.licenseKeyId &&
              f.fingerprintHash === k.fingerprintHash,
          ) ?? null
        );
      },
      count: async ({ where }: any) =>
        fps.filter(
          (f) =>
            f.licenseKeyId === where.licenseKeyId &&
            f.isActive === where.isActive &&
            f.revokedAt === where.revokedAt,
        ).length,
      create: async ({ data }: any) => {
        const row: FakeFp = {
          id: `fp_${nextId++}`,
          licenseKeyId: data.licenseKeyId,
          fingerprintHash: data.fingerprintHash,
          deviceLabel: data.deviceLabel ?? null,
          isActive: true,
          revokedAt: null,
          revokedReason: null,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        };
        fps.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const idx = fps.findIndex((f) => f.id === where.id);
        if (idx === -1) throw new Error('not found');
        fps[idx] = { ...fps[idx], ...data };
        return fps[idx];
      },
      findMany: async ({ where }: any) =>
        fps.filter((f) => f.licenseKeyId === where.licenseKeyId),
    },
    _fps: fps,
  } as any;
}

describe('FingerprintService (T62)', () => {
  describe('register', () => {
    it('creates a new binding when under maxDevices', async () => {
      const prisma = makePrisma([
        { id: 'lk1', maxDevices: 2, revokedAt: null },
      ]);
      const svc = new FingerprintService(prisma);
      const out = await svc.register('lk1', VALID_HASH_A, 'POS-1');
      expect(out.fingerprintHash).toBe(VALID_HASH_A);
      expect(out.isActive).toBe(true);
      expect(out.deviceLabel).toBe('POS-1');
    });

    it('is idempotent — second register on same hash refreshes lastSeenAt', async () => {
      const prisma = makePrisma([
        { id: 'lk1', maxDevices: 2, revokedAt: null },
      ]);
      const svc = new FingerprintService(prisma);
      const first = await svc.register('lk1', VALID_HASH_A);
      const second = await svc.register('lk1', VALID_HASH_A, 'New-Label');
      expect(second.id).toBe(first.id);
      expect(second.deviceLabel).toBe('New-Label');
      expect(prisma._fps).toHaveLength(1);
    });

    it('reactivates a previously revoked binding on re-register', async () => {
      const prisma = makePrisma(
        [{ id: 'lk1', maxDevices: 2, revokedAt: null }],
        [
          {
            id: 'fp_old',
            licenseKeyId: 'lk1',
            fingerprintHash: VALID_HASH_A,
            deviceLabel: null,
            isActive: false,
            revokedAt: new Date(),
            revokedReason: 'manual_revoke',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
        ],
      );
      const svc = new FingerprintService(prisma);
      const out = await svc.register('lk1', VALID_HASH_A);
      expect(out.isActive).toBe(true);
      expect(out.revokedAt).toBeNull();
    });

    it('throws MAX_DEVICES_EXCEEDED when active count >= maxDevices', async () => {
      const prisma = makePrisma(
        [{ id: 'lk1', maxDevices: 2, revokedAt: null }],
        [
          {
            id: 'fp_a',
            licenseKeyId: 'lk1',
            fingerprintHash: VALID_HASH_A,
            deviceLabel: null,
            isActive: true,
            revokedAt: null,
            revokedReason: null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
          {
            id: 'fp_b',
            licenseKeyId: 'lk1',
            fingerprintHash: VALID_HASH_B,
            deviceLabel: null,
            isActive: true,
            revokedAt: null,
            revokedReason: null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
        ],
      );
      const svc = new FingerprintService(prisma);
      await expect(svc.register('lk1', VALID_HASH_C)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('does NOT count revoked bindings toward maxDevices', async () => {
      const prisma = makePrisma(
        [{ id: 'lk1', maxDevices: 1, revokedAt: null }],
        [
          {
            id: 'fp_a',
            licenseKeyId: 'lk1',
            fingerprintHash: VALID_HASH_A,
            deviceLabel: null,
            isActive: false,
            revokedAt: new Date(),
            revokedReason: 'manual_revoke',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
        ],
      );
      const svc = new FingerprintService(prisma);
      const out = await svc.register('lk1', VALID_HASH_B);
      expect(out.fingerprintHash).toBe(VALID_HASH_B);
    });

    it('rejects unknown licenseKeyId', async () => {
      const prisma = makePrisma([]);
      const svc = new FingerprintService(prisma);
      await expect(svc.register('missing', VALID_HASH_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects revoked license key', async () => {
      const prisma = makePrisma([
        { id: 'lk1', maxDevices: 5, revokedAt: new Date() },
      ]);
      const svc = new FingerprintService(prisma);
      await expect(svc.register('lk1', VALID_HASH_A)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects malformed fingerprint hash', async () => {
      const prisma = makePrisma([
        { id: 'lk1', maxDevices: 2, revokedAt: null },
      ]);
      const svc = new FingerprintService(prisma);
      await expect(svc.register('lk1', 'NOT-HEX')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        svc.register('lk1', 'A'.repeat(64)), // uppercase rejected
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('validate', () => {
    it('returns true for an active binding', async () => {
      const prisma = makePrisma(
        [{ id: 'lk1', maxDevices: 2, revokedAt: null }],
        [
          {
            id: 'fp_a',
            licenseKeyId: 'lk1',
            fingerprintHash: VALID_HASH_A,
            deviceLabel: null,
            isActive: true,
            revokedAt: null,
            revokedReason: null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
        ],
      );
      const svc = new FingerprintService(prisma);
      await expect(svc.validate('lk1', VALID_HASH_A)).resolves.toBe(true);
    });

    it('returns false for unknown binding', async () => {
      const prisma = makePrisma([
        { id: 'lk1', maxDevices: 2, revokedAt: null },
      ]);
      const svc = new FingerprintService(prisma);
      await expect(svc.validate('lk1', VALID_HASH_A)).resolves.toBe(false);
    });

    it('returns false for revoked binding', async () => {
      const prisma = makePrisma(
        [{ id: 'lk1', maxDevices: 2, revokedAt: null }],
        [
          {
            id: 'fp_a',
            licenseKeyId: 'lk1',
            fingerprintHash: VALID_HASH_A,
            deviceLabel: null,
            isActive: false,
            revokedAt: new Date(),
            revokedReason: 'manual_revoke',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
        ],
      );
      const svc = new FingerprintService(prisma);
      await expect(svc.validate('lk1', VALID_HASH_A)).resolves.toBe(false);
    });
  });

  describe('revoke', () => {
    it('soft-revokes and is idempotent', async () => {
      const prisma = makePrisma(
        [{ id: 'lk1', maxDevices: 2, revokedAt: null }],
        [
          {
            id: 'fp_a',
            licenseKeyId: 'lk1',
            fingerprintHash: VALID_HASH_A,
            deviceLabel: null,
            isActive: true,
            revokedAt: null,
            revokedReason: null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
        ],
      );
      const svc = new FingerprintService(prisma);
      await svc.revoke('lk1', VALID_HASH_A, 'lost-device');
      expect(prisma._fps[0].isActive).toBe(false);
      expect(prisma._fps[0].revokedAt).not.toBeNull();
      expect(prisma._fps[0].revokedReason).toBe('lost-device');

      // second call is no-op (no throw)
      await expect(svc.revoke('lk1', VALID_HASH_A)).resolves.toBeUndefined();
    });

    it('throws when fingerprint not found', async () => {
      const prisma = makePrisma([
        { id: 'lk1', maxDevices: 2, revokedAt: null },
      ]);
      const svc = new FingerprintService(prisma);
      await expect(svc.revoke('lk1', VALID_HASH_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('listDevices', () => {
    it('returns all bindings for a license (active + revoked)', async () => {
      const prisma = makePrisma(
        [{ id: 'lk1', maxDevices: 5, revokedAt: null }],
        [
          {
            id: 'fp_a',
            licenseKeyId: 'lk1',
            fingerprintHash: VALID_HASH_A,
            deviceLabel: 'POS-1',
            isActive: true,
            revokedAt: null,
            revokedReason: null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
          {
            id: 'fp_b',
            licenseKeyId: 'lk1',
            fingerprintHash: VALID_HASH_B,
            deviceLabel: 'POS-2',
            isActive: false,
            revokedAt: new Date(),
            revokedReason: 'manual_revoke',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
          },
        ],
      );
      const svc = new FingerprintService(prisma);
      const list = await svc.listDevices('lk1');
      expect(list).toHaveLength(2);
    });
  });
});
