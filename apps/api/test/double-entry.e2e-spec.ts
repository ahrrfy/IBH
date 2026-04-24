import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * Double-Entry guarantee (F2 Philosophy).
 *
 * The DB CHECK constraint must reject any journal entry where
 * total_debit_iqd != total_credit_iqd. This is enforced at the database
 * level — unbreakable by application code.
 */
describe('Posting — Double-Entry Integrity (e2e)', () => {
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

  it('DB rejects unbalanced JE via raw SQL', async () => {
    // Attempt a direct unbalanced insert — should be rejected by CHECK constraint
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO journal_entries
          ("id", "companyId", "entryNumber", "entryDate", "description",
           "refType", "refId", "totalDebitIqd", "totalCreditIqd",
           "status", "periodId", "createdBy")
        VALUES (
          gen_ulid(), gen_ulid()::char(26), 'TEST-UNBAL-1', NOW(), 'test unbalanced',
          'Test', gen_ulid()::char(26), 1000, 500,
          'draft', gen_ulid()::char(26), gen_ulid()::char(26)
        )
      `),
    ).rejects.toThrow();
  });
});
