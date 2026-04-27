import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { LicensingService } from '../src/modules/licensing/licensing.service';

/**
 * License Heartbeat (F6 — M12):
 *   1. Valid license + matching fingerprint → { valid: true, expiresIn }
 *   2. Revoked license → { valid: false, reason: 'revoked' }
 *   3. Expired license within grace period → { valid: true, inGrace: true }
 *   4. Expired license past grace period → { valid: false, reason: 'expired' }
 *   5. Fingerprint mismatch → { valid: false, reason: 'fingerprint_mismatch' }
 *   6. Unknown licenseKey → NotFoundException
 *   7. Successful heartbeat updates lastHeartbeatAt timestamp
 */
describe('License Heartbeat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licensing: LicensingService;

  const TEST_FINGERPRINT = 'test-device-fp-abc123';

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
    await app?.close();
  });

  it('valid active license returns { valid: true, expiresIn }', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!user) return;

    // Create a test license expiring in 30 days
    const licenseKey = `TEST-LIC-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.license.create({
      data: {
        licenseKey,
        companyId: company.id,
        plan: 'pro',
        isActive: true,
        hardwareFingerprint: TEST_FINGERPRINT,
        expiresAt,
        issuedAt: new Date(),
        signature: 'test-sig',
        features: ['pos', 'inventory', 'finance'],
        issuedBy: user.id,
      },
    });

    const result = await licensing.heartbeat(licenseKey, TEST_FINGERPRINT);

    expect(result.valid).toBe(true);
    expect(result.expiresIn).toBeGreaterThan(0);
    expect(result.expiresIn).toBeLessThanOrEqual(30);

    // Cleanup
    await prisma.license.deleteMany({ where: { licenseKey } });
  });

  it('heartbeat updates lastHeartbeatAt', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!user) return;

    const licenseKey = `TEST-HB-${Date.now()}`;

    await prisma.license.create({
      data: {
        licenseKey,
        companyId: company.id,
        plan: 'starter',
        isActive: true,
        hardwareFingerprint: TEST_FINGERPRINT,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        issuedAt: new Date(),
        signature: 'test-sig',
        features: [],
        issuedBy: user.id,
      },
    });

    const before = new Date();
    await licensing.heartbeat(licenseKey, TEST_FINGERPRINT);
    const after = new Date();

    const updated = await prisma.license.findUnique({ where: { licenseKey } });
    expect(updated!.lastHeartbeatAt).not.toBeNull();
    expect(updated!.lastHeartbeatAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(updated!.lastHeartbeatAt!.getTime()).toBeLessThanOrEqual(after.getTime());

    await prisma.license.deleteMany({ where: { licenseKey } });
  });

  it('revoked license returns { valid: false, reason: revoked }', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!user) return;

    const licenseKey = `TEST-REV-${Date.now()}`;

    await prisma.license.create({
      data: {
        licenseKey,
        companyId: company.id,
        plan: 'starter',
        isActive: false,
        hardwareFingerprint: TEST_FINGERPRINT,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        issuedAt: new Date(),
        revokedAt: new Date(),
        revokedReason: 'Test revocation',
        signature: 'test-sig',
        features: [],
        issuedBy: user.id,
      },
    });

    const result = await licensing.heartbeat(licenseKey, TEST_FINGERPRINT);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('revoked');

    await prisma.license.deleteMany({ where: { licenseKey } });
  });

  it('expired license within grace period returns { valid: true, inGrace: true }', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!user) return;

    const licenseKey = `TEST-GRACE-${Date.now()}`;
    // Expired 5 days ago (within 30-day grace period)
    const expiresAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    await prisma.license.create({
      data: {
        licenseKey,
        companyId: company.id,
        plan: 'pro',
        isActive: true,
        hardwareFingerprint: TEST_FINGERPRINT,
        expiresAt,
        issuedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        signature: 'test-sig',
        features: [],
        issuedBy: user.id,
      },
    });

    const result = await licensing.heartbeat(licenseKey, TEST_FINGERPRINT);

    expect(result.valid).toBe(true);
    expect(result.inGrace).toBe(true);
    expect((result as any).graceRemaining).toBeGreaterThan(0);

    await prisma.license.deleteMany({ where: { licenseKey } });
  });

  it('expired license past grace period returns { valid: false, reason: expired }', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!user) return;

    const licenseKey = `TEST-EXP-${Date.now()}`;
    // Expired 45 days ago (past 30-day grace period)
    const expiresAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

    await prisma.license.create({
      data: {
        licenseKey,
        companyId: company.id,
        plan: 'starter',
        isActive: true,
        hardwareFingerprint: TEST_FINGERPRINT,
        expiresAt,
        issuedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
        signature: 'test-sig',
        features: [],
        issuedBy: user.id,
      },
    });

    const result = await licensing.heartbeat(licenseKey, TEST_FINGERPRINT);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');

    await prisma.license.deleteMany({ where: { licenseKey } });
  });

  it('fingerprint mismatch returns { valid: false, reason: fingerprint_mismatch }', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!user) return;

    const licenseKey = `TEST-FP-${Date.now()}`;

    await prisma.license.create({
      data: {
        licenseKey,
        companyId: company.id,
        plan: 'pro',
        isActive: true,
        hardwareFingerprint: 'original-device-fingerprint',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        issuedAt: new Date(),
        signature: 'test-sig',
        features: [],
        issuedBy: user.id,
      },
    });

    const result = await licensing.heartbeat(licenseKey, 'different-device-fingerprint');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('fingerprint_mismatch');

    await prisma.license.deleteMany({ where: { licenseKey } });
  });

  it('unknown licenseKey throws NotFoundException', async () => {
    await expect(
      licensing.heartbeat('NONEXISTENT-KEY-12345', TEST_FINGERPRINT),
    ).rejects.toMatchObject({ response: { code: 'LICENSE_NOT_FOUND' } });
  });
});
