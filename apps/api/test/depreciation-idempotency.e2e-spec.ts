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

  it('DB unique index rejects a second depreciation row for the same asset+year+month', async () => {
    const assetId = 'TESTASSETDEPRECIATION0000A';
    const year = 2099;
    const month = 12;

    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO asset_depreciation
          ("id", "assetId", "periodYear", "periodMonth",
           "depreciationIqd", "accumulatedIqd", "bookValueIqd", "createdAt")
        VALUES
          (gen_ulid(), '${assetId}', ${year}, ${month},
           1000, 1000, 9000, NOW()),
          (gen_ulid(), '${assetId}', ${year}, ${month},
           1000, 2000, 8000, NOW())
      `),
    ).rejects.toThrow();
  });

  it('DB allows a depreciation row for the same asset in a DIFFERENT month', async () => {
    const assetId = 'TESTASSETDEPRECIATION0000B';
    const year = 2099;

    const result = await prisma.$executeRawUnsafe(`
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
  });
});
