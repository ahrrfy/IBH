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

  // Tests target the partial unique index, NOT the FK chain. Each test
  // runs inside a single Prisma transaction so `SET LOCAL
  // session_replication_role = 'replica'` (which disables FK triggers
  // for the connection) and the subsequent INSERT happen on the same
  // pinned pg connection. Without this, Prisma 7's pg adapter checks
  // out a fresh pool connection per query → the `SET` is set on
  // connection X, the INSERT runs on connection Y with FK still
  // enforced → 23503 violation. The transaction also rolls back any
  // synthetic rows so the test leaves no residue.

  it('DB partial unique index rejects a second open shift on the same device', async () => {
    const deviceId = 'TESTSHIFTDEVICE0000000000A';

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        await tx.$executeRawUnsafe(`
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
        `);
      }),
    ).rejects.toThrow();
  });

  it('DB allows a new open shift after the previous one is closed', async () => {
    const deviceId = 'TESTSHIFTDEVICE0000000000B';

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);

      // Cannot do this in a single CTE — PostgreSQL CTEs see the snapshot
      // from before the statement, so an UPDATE in one CTE can't see rows
      // that an INSERT in another CTE just wrote. Split into 3 statements.

      // 1. Insert first open shift
      await tx.$executeRawUnsafe(`
        INSERT INTO shifts
          ("id", "companyId", "branchId", "posDeviceId", "cashierId",
           "shiftNumber", "openingCashIqd", "status", "openedAt")
        VALUES
          (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
           '${deviceId}', gen_ulid()::char(26),
           'TEST-SHIFT-C', 100000, 'open', NOW())
      `);

      // 2. Close it
      await tx.$executeRawUnsafe(`
        UPDATE shifts SET "status" = 'closed', "closedAt" = NOW()
        WHERE "posDeviceId" = '${deviceId}' AND "status" = 'open'
      `);

      // 3. Insert another open shift on the SAME device — must succeed
      //    because the partial unique only counts WHERE status='open'.
      const inserted = await tx.$executeRawUnsafe(`
        INSERT INTO shifts
          ("id", "companyId", "branchId", "posDeviceId", "cashierId",
           "shiftNumber", "openingCashIqd", "status", "openedAt")
        VALUES
          (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
           '${deviceId}', gen_ulid()::char(26),
           'TEST-SHIFT-D', 100000, 'open', NOW())
      `);

      expect(inserted).toBeGreaterThanOrEqual(1);

      // Force rollback so synthetic rows don't leak between test runs.
      throw new Error('__TEST_ROLLBACK__');
    }).catch((e) => {
      if ((e as Error).message !== '__TEST_ROLLBACK__') throw e;
    });
  });
});
