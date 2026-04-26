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

  // Tests target the partial unique index, NOT the FK chain. Disable FK
  // checks for the duration of these inserts so we don't have to seed
  // company → branch → cashier → posDevice rows that aren't relevant.
  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  });
  afterAll(async () => {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
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

    // Cannot do this in a single CTE — PostgreSQL CTEs see the snapshot
    // from before the statement, so an UPDATE in one CTE can't see rows
    // that an INSERT in another CTE just wrote. Split into 3 statements.

    // 1. Insert first open shift
    await prisma.$executeRawUnsafe(`
      INSERT INTO shifts
        ("id", "companyId", "branchId", "posDeviceId", "cashierId",
         "shiftNumber", "openingCashIqd", "status", "openedAt")
      VALUES
        (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
         '${deviceId}', gen_ulid()::char(26),
         'TEST-SHIFT-C', 100000, 'open', NOW())
    `);

    // 2. Close it
    await prisma.$executeRawUnsafe(`
      UPDATE shifts SET "status" = 'closed', "closedAt" = NOW()
      WHERE "posDeviceId" = '${deviceId}' AND "status" = 'open'
    `);

    // 3. Insert another open shift on the SAME device — must succeed
    //    because the partial unique only counts WHERE status='open'.
    const inserted = await prisma.$executeRawUnsafe(`
      INSERT INTO shifts
        ("id", "companyId", "branchId", "posDeviceId", "cashierId",
         "shiftNumber", "openingCashIqd", "status", "openedAt")
      VALUES
        (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
         '${deviceId}', gen_ulid()::char(26),
         'TEST-SHIFT-D', 100000, 'open', NOW())
    `);

    expect(inserted).toBeGreaterThanOrEqual(1);
  });
});
