import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * W4 acceptance: monthly depreciation must be idempotent per asset+period.
 * Enforced by `@@unique([assetId, periodYear, periodMonth])` on
 * AssetDepreciation (schema.prisma:2101).
 *
 * Critical because the depreciation generator iterates all active assets
 * and calls `prisma.assetDepreciation.findFirst` to skip already-posted
 * rows (depreciation.service.ts:53-56). If that guard is bypassed (e.g.
 * concurrent runs of the monthly job), the DB unique index MUST reject
 * the duplicate — otherwise the JE posting would double-debit the
 * depreciation expense account.
 */
describe('AssetDepreciation — period idempotency (e2e)', () => {
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

  // Each test runs inside a single Prisma transaction so `SET LOCAL
  // session_replication_role = 'replica'` and the subsequent INSERT
  // share a pinned pg connection (Prisma 7's adapter otherwise hands
  // out a fresh pool connection per query → FK still enforced on the
  // INSERT). The transaction also rolls back synthetic rows.

  it('DB unique index rejects a second depreciation row for the same asset+year+month', async () => {
    const assetId = 'TESTASSETDEPRECIATION0000A';
    const year = 2099;
    const month = 12;

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        await tx.$executeRawUnsafe(`
          INSERT INTO asset_depreciation
            ("id", "assetId", "periodYear", "periodMonth",
             "depreciationIqd", "accumulatedIqd", "bookValueIqd", "createdAt")
          VALUES
            (gen_ulid(), '${assetId}', ${year}, ${month},
             1000, 1000, 9000, NOW()),
            (gen_ulid(), '${assetId}', ${year}, ${month},
             1000, 2000, 8000, NOW())
        `);
      }),
    ).rejects.toThrow();
  });

  it('DB allows a depreciation row for the same asset in a DIFFERENT month', async () => {
    const assetId = 'TESTASSETDEPRECIATION0000B';
    const year = 2099;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
      const result = await tx.$executeRawUnsafe(`
        INSERT INTO asset_depreciation
          ("id", "assetId", "periodYear", "periodMonth",
           "depreciationIqd", "accumulatedIqd", "bookValueIqd", "createdAt")
        VALUES
          (gen_ulid(), '${assetId}', ${year}, 1,
           1000, 1000, 9000, NOW()),
          (gen_ulid(), '${assetId}', ${year}, 2,
           1000, 2000, 8000, NOW()),
          (gen_ulid(), '${assetId}', ${year}, 3,
           1000, 3000, 7000, NOW())
      `);
      expect(result).toBeGreaterThanOrEqual(3);

      // Force rollback to leave no residue between test runs.
      throw new Error('__TEST_ROLLBACK__');
    }).catch((e) => {
      if ((e as Error).message !== '__TEST_ROLLBACK__') throw e;
    });
  });
});
