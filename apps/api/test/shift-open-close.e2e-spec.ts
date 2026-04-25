import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * W2 acceptance: only ONE shift may be `open` per POS device at a time.
 * Enforced by partial unique index `shifts_one_open_per_device` (migration
 * 0002, line 382): UNIQUE("posDeviceId") WHERE status = 'open'.
 *
 * The service catches P2002 from this index and rethrows ConflictException
 * (shifts.service.ts#openShift). This test verifies the DB invariant
 * directly so the guard cannot be bypassed by raw inserts.
 */
describe('Shift open/close — one open shift per device (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('DB partial unique index rejects a second open shift on the same device', async () => {
    const deviceId = 'TESTSHIFTDEVICE0000000000A';

    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO shifts
          ("id", "companyId", "branchId", "posDeviceId", "cashierId",
           "shiftNumber", "openingCashIqd", "status", "openedAt")
        VALUES
          (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
           '${deviceId}', gen_ulid()::char(26),
           'TEST-SHIFT-A', 100000, 'open', NOW()),
          (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
           '${deviceId}', gen_ulid()::char(26),
           'TEST-SHIFT-B', 100000, 'open', NOW())
      `),
    ).rejects.toThrow();
  });

  it('DB allows a new open shift after the previous one is closed', async () => {
    const deviceId = 'TESTSHIFTDEVICE0000000000B';

    // First batch: insert one open, then close it, then insert another open.
    // Whole sequence must succeed because the partial unique only counts rows
    // WHERE status='open'.
    const result = await prisma.$executeRawUnsafe(`
      WITH first_open AS (
        INSERT INTO shifts
          ("id", "companyId", "branchId", "posDeviceId", "cashierId",
           "shiftNumber", "openingCashIqd", "status", "openedAt")
        VALUES
          (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
           '${deviceId}', gen_ulid()::char(26),
           'TEST-SHIFT-C', 100000, 'open', NOW())
        RETURNING "id"
      ),
      closed AS (
        UPDATE shifts SET "status" = 'closed', "closedAt" = NOW()
        WHERE "id" = (SELECT "id" FROM first_open)
        RETURNING "id"
      )
      INSERT INTO shifts
        ("id", "companyId", "branchId", "posDeviceId", "cashierId",
         "shiftNumber", "openingCashIqd", "status", "openedAt")
      SELECT
        gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
        '${deviceId}', gen_ulid()::char(26),
        'TEST-SHIFT-D', 100000, 'open', NOW()
      FROM closed
    `);

    expect(result).toBeGreaterThanOrEqual(1);
  });
});
