import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { LicensingService } from '../src/modules/licensing/licensing.service';

/**
 * License Heartbeat — F6 integrity (e2e)
 *
 * Verifies the heartbeat / validity-check flow of the legacy `License`
 * model (wave-1 RSA-signed license, distinct from the wave-5 subscription
 * model).  Uses LicensingService.heartbeat() directly — no HTTP layer.
 *
 * Invariants tested:
 *   1. Valid (active, not expired) license → { valid: true, expiresIn }
 *      and lastHeartbeatAt is updated in DB.
 *   2. Unknown licenseKey → NotFoundException (not null, not silent skip).
 *   3. Revoked license → { valid: false, reason: 'revoked' } (no throw).
 *   4. Fingerprint mismatch on activated license → { valid: false, reason: 'fingerprint_mismatch' }.
 *   5. Expired license outside grace period → { valid: false, reason: 'expired' }.
 *
 * Each test seeds its own License row and tears it down in afterEach —
 * keeps tests hermetic without depending on the global seed.
 *
 * Schema fields used (from prisma/schema.prisma model License):
 *   licenseKey, clientName, plan, issuedAt, expiresAt,
 *   maxCompanies, maxBranches, maxUsers, enabledModules,
 *   isActive, hardwareFingerprint, lastHeartbeatAt,
 *   revokedAt, signature, createdBy
 */
describe('License Heartbeat — F6 validity flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licensing: LicensingService;

  // Track created license IDs for cleanup
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    licensing = app.get(LicensingService);
  });

  afterAll(async () => {
    // Clean up seeded test licenses (soft-delete safe — no append-only trigger on licenses)
    if (createdIds.length > 0) {
      await prisma.license.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app?.close();
  });

  /**
   * Helper: create a minimal License row directly via Prisma.
   * Mirrors what issueLicense() does without requiring auth session.
   * Returns the created record so the caller can extract licenseKey.
   */
  async function seedLicense(overrides: {
    licenseKey?: string;
    plan?: string;
    expiresAt?: Date;
    isActive?: boolean;
    hardwareFingerprint?: string | null;
    activatedAt?: Date | null;
    revokedAt?: Date | null;
    lastHeartbeatAt?: Date | null;
  }) {
    const licenseKey = overrides.licenseKey ?? crypto.randomBytes(32).toString('hex');
    const plan = overrides.plan ?? 'trial';
    const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1yr
    const payload = { licenseKey, clientName: 'E2E Test Client', plan, expiresAt: expiresAt.toISOString() };
    const signature = crypto.createHmac('sha256', 'al-ruya-default-key').update(JSON.stringify(payload)).digest('hex');

    // createdBy needs a valid Char(26) — use a zero-padded string since there is
    // no FK constraint on this column in the schema (plain Char(26), no @relation).
    const dummyCreatedBy = '00000000000000000000000000'.slice(0, 26);

    const license = await prisma.license.create({
      data: {
        licenseKey,
        clientName: 'E2E Test Client',
        clientContactEmail: 'e2e@test.local',
        plan: plan as any,
        issuedAt: new Date(),
        expiresAt,
        maxCompanies: 1,
        maxBranches: 1,
        maxUsers: 5,
        enabledModules: ['sales', 'pos'],
        isActive: overrides.isActive ?? true,
        hardwareFingerprint: overrides.hardwareFingerprint !== undefined ? overrides.hardwareFingerprint : null,
        activatedAt: overrides.activatedAt !== undefined ? overrides.activatedAt : null,
        revokedAt: overrides.revokedAt !== undefined ? overrides.revokedAt : null,
        lastHeartbeatAt: overrides.lastHeartbeatAt !== undefined ? overrides.lastHeartbeatAt : null,
        signature,
        createdBy: dummyCreatedBy,
      },
    });

    createdIds.push(license.id);
    return license;
  }

  it('valid active license returns { valid: true, expiresIn } and updates lastHeartbeatAt', async () => {
    const fingerprint = 'FP-VALID-E2E';
    const license = await seedLicense({
      activatedAt: new Date(),
      hardwareFingerprint: fingerprint,
    });

    const before = await prisma.license.findUnique({ where: { licenseKey: license.licenseKey } });
    const prevHeartbeat = before?.lastHeartbeatAt;

    const result = await licensing.heartbeat(license.licenseKey, fingerprint);

    expect(result).toMatchObject({ valid: true });
    expect(typeof (result as { expiresIn: number }).expiresIn).toBe('number');
    expect((result as { expiresIn: number }).expiresIn).toBeGreaterThan(0);

    // lastHeartbeatAt must have been updated
    const after = await prisma.license.findUnique({ where: { licenseKey: license.licenseKey } });
    expect(after?.lastHeartbeatAt).toBeTruthy();
    if (prevHeartbeat && after?.lastHeartbeatAt) {
      expect(after.lastHeartbeatAt.getTime()).toBeGreaterThanOrEqual(prevHeartbeat.getTime());
    }
  });

  it('unknown licenseKey throws NotFoundException', async () => {
    const bogusKey = crypto.randomBytes(32).toString('hex');
    await expect(licensing.heartbeat(bogusKey, 'any-fp')).rejects.toMatchObject({
      response: { code: 'LICENSE_NOT_FOUND' },
    });
  });

  it('revoked license returns { valid: false, reason: "revoked" } without throwing', async () => {
    const license = await seedLicense({
      revokedAt: new Date(Date.now() - 60_000),
    });

    const result = await licensing.heartbeat(license.licenseKey, 'any-fp');
    expect(result).toMatchObject({ valid: false, reason: 'revoked' });
  });

  it('fingerprint mismatch on activated license returns { valid: false, reason: "fingerprint_mismatch" }', async () => {
    const license = await seedLicense({
      activatedAt: new Date(),
      hardwareFingerprint: 'ORIGINAL-FINGERPRINT',
    });

    const result = await licensing.heartbeat(license.licenseKey, 'DIFFERENT-FINGERPRINT');
    expect(result).toMatchObject({ valid: false, reason: 'fingerprint_mismatch' });
  });

  it('expired license outside grace period returns { valid: false, reason: "expired" }', async () => {
    // Set expiresAt to 31 days in the past (beyond the 30-day grace window)
    const expiredAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const license = await seedLicense({ expiresAt: expiredAt });

    const result = await licensing.heartbeat(license.licenseKey, 'any-fp');
    expect(result).toMatchObject({ valid: false, reason: 'expired' });
  });
});
